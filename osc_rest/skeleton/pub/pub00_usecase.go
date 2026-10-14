package pub

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"osc_rest/mechanic"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// hrisAllowedHosts memuat allowlist host HRIS dari env HRIS_ALLOWED_HOSTS
// (dipisah koma). Bila kosong, hanya endpoint https yang diizinkan.
func hrisAllowedHosts() map[string]bool {
	m := map[string]bool{}
	for _, h := range strings.Split(os.Getenv("HRIS_ALLOWED_HOSTS"), ",") {
		if s := strings.ToLower(strings.TrimSpace(h)); s != "" {
			m[s] = true
		}
	}
	return m
}

func Companies(ctx context.Context) ([]CompanyOption, error) {
	return companyOptions(ctx)
}

func Login(ctx context.Context, req LoginRequest) (LoginResponse, error) {
	db := pg
	username := strings.TrimSpace(req.Username)
	password := req.Password
	if username == "" || password == "" {
		return LoginResponse{}, errors.New("username and password are required")
	}
	user, err := findUserByLogin(ctx, db, req.CompanyID, username)
	if err != nil {
		return LoginResponse{}, errors.New("invalid username or password")
	}
	if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		return LoginResponse{}, errors.New("account is locked, try again later")
	}

	// HRIS external login
	if user.IsHris {
		hrisLink, err := companyHrisLink(ctx, db, user.CompanyID)
		if err != nil {
			return LoginResponse{}, fmt.Errorf("failed to check HRIS config: %w", err)
		}
		if hrisLink != "" {
			if err := hrisExternalLogin(hrisLink, username, password); err != nil {
				return LoginResponse{}, err
			}
			// HRIS login success — encrypt password and save to user.key
			encrypted, err := mechanic.Encrypt(password)
			if err != nil {
				return LoginResponse{}, fmt.Errorf("failed to encrypt credentials: %w", err)
			}
			if err := updateUserKey(ctx, db, user.ID, encrypted); err != nil {
				return LoginResponse{}, fmt.Errorf("failed to save HRIS credentials: %w", err)
			}
			user.Key = encrypted
			// Skip bcrypt check for HRIS users (external auth passed)
			goto session
		}
	}

	// Standard local login — bcrypt check
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) != nil {
		_ = recordFailedAttempt(ctx, db, user.ID)
		return LoginResponse{}, errors.New("invalid username or password")
	}

session:
	if !user.IsActive {
		return LoginResponse{}, errors.New("account is deactivated")
	}

	// Verifikasi TOTP wajib bila 2FA aktif untuk akun ini (berlaku untuk
	// login lokal maupun HRIS).
		if user.IsTOTPEnabled {
			if user.TOTPSecret == nil || *user.TOTPSecret == "" {
				return LoginResponse{}, errors.New("account 2FA is misconfigured")
			}
			if req.TOTPCode == "" {
				return LoginResponse{}, ErrTOTPRequired
			}
			secret := *user.TOTPSecret
			if dec, err := mechanic.Decrypt(secret); err == nil {
				secret = dec
			}
			if !mechanic.VerifyTOTP(secret, req.TOTPCode) {
				_ = recordFailedAttempt(ctx, db, user.ID)
				return LoginResponse{}, errors.New("invalid username or password")
			}
		}
	if err := resetFailedAttempt(ctx, db, user.ID); err != nil {
		return LoginResponse{}, err
	}
	issued := time.Now()
	expires := issued.Add(sessionTTL)
	token := uuid.New().String()
	tokenHash := mechanic.HashToken(token)
	if _, err := createSession(ctx, db, appUserTokenCreate{
		UserID:          user.ID,
		TokenType:       "WEB",
		Token:           tokenHash,
		AccessExpiresAt: expires,
	}); err != nil {
		return LoginResponse{}, err
	}
	name, err := companyName(ctx, db, user.CompanyID)
	if err != nil {
		return LoginResponse{}, err
	}
	return LoginResponse{
		Token:     token,
		ExpiresAt: expires.Format(time.RFC3339),
		UserProfile: UserProfile{
			ID:          user.ID,
			Username:    user.Username,
			Email:       user.Email,
			Fullname:    user.Fullname,
			Phone:       user.Phone,
			Role:        user.Role,
			Job:         user.Job,
			CompanyID:   user.CompanyID,
			CompanyName: name,
			IsAdmin:     user.IsAdmin,
			IsHris:      user.IsHris,
			IsActive:    user.IsActive,
		},
	}, nil
}

// hrisExternalLogin memanggil endpoint HRIS eksternal untuk memverifikasi
// kredensial pengguna. URL harus mengandung placeholder {$U} untuk username
// dan {$P} untuk password.
//
// Hardening SSRF:
//   - nilai disubstitusi di-URL-encode (mencegah query/path injection),
//   - skema dibatasi ke http/https,
//   - host harus ada di allowlist HRIS_ALLOWED_HOSTS (bila diset),
//   - redirect tidak diikuti, timeout dibatasi.
func hrisExternalLogin(hrisLink, username, password string) error {
	rawURL := strings.ReplaceAll(hrisLink, "{$U}", url.QueryEscape(username))
	rawURL = strings.ReplaceAll(rawURL, "{$P}", url.QueryEscape(password))

	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return errors.New("HRIS: invalid endpoint URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("HRIS: unsupported URL scheme")
	}
	allowedHosts := hrisAllowedHosts()
	if len(allowedHosts) > 0 {
		if !allowedHosts[strings.ToLower(parsed.Hostname())] {
			return errors.New("HRIS: endpoint host is not allowed")
		}
	} else if parsed.Scheme != "https" {
		return errors.New("HRIS: only https endpoints are allowed when HRIS_ALLOWED_HOSTS is unset")
	}

	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Get(rawURL)
	if err != nil {
		return fmt.Errorf("HRIS connection failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("HRIS response read failed: %w", err)
	}

	raw := strings.TrimSpace(string(body))

	// Strip XML wrapper jika ada: <string xmlns="...">...</string>
	if idx := strings.Index(raw, ">"); idx != -1 {
		if endIdx := strings.LastIndex(raw, "</"); endIdx > idx {
			raw = strings.TrimSpace(raw[idx+1 : endIdx])
		}
	}

	// Format sukses: "1|---|<EmpDet .../>..."
	// Format gagal:  "0|---|NONE"
	parts := strings.SplitN(raw, "|---|", 2)
	if len(parts) != 2 {
		return errors.New("HRIS: unexpected response format")
	}

	status := strings.TrimSpace(parts[0])
	if status != "1" {
		return errors.New("HRIS: authentication failed")
	}

	return nil
}
