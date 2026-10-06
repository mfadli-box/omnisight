package sys

import (
	"context"
	"errors"
	"strings"

	"osc_rest/mechanic"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// pg adalah koneksi pool yang disuntikkan backbone lewat Use.
var pg *pgxpool.Pool

// Use menyuntikkan koneksi database dari backbone.
func Use(p *pgxpool.Pool) {
	pg = p
}

// Profile mengembalikan profil lengkap user yang sedang login.
func Profile(ctx context.Context, userID string) (ProfileResponse, error) {
	if strings.TrimSpace(userID) == "" {
		return ProfileResponse{}, errors.New("user not loaded")
	}
	return profileByID(ctx, pg, userID)
}

// ChangePassword mengganti password user setelah memverifikasi password lama.
func ChangePassword(ctx context.Context, userID, oldPassword, newPassword string) error {
	if strings.TrimSpace(userID) == "" {
		return errors.New("user not loaded")
	}
	if strings.TrimSpace(newPassword) == "" {
		return mechanic.ValidationError("New password is required")
	}
	if len(newPassword) < 6 {
		return mechanic.ValidationError("New password must be at least 6 characters")
	}
	hash, err := passwordHashByID(ctx, pg, userID)
	if err != nil {
		return errors.New("user not found")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(oldPassword)) != nil {
		return mechanic.ValidationError("Current password is incorrect")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return updatePasswordHash(ctx, pg, userID, string(newHash))
}

// History mengembalikan riwayat sesi login user (paginated).
func History(ctx context.Context, p mechanic.GridParams, userID string) (mechanic.Page[HistoryResponse], error) {
	if strings.TrimSpace(userID) == "" {
		return mechanic.Page[HistoryResponse]{}, errors.New("user not loaded")
	}
	return historyList(ctx, pg, p, userID)
}
