// Package rustapi — adapter klien HTTP hardened untuk osc_rest
// (implementasi port domain.RustAPIClient / domain.RetentionClient).
//
// Jaminan (standar skill ai-auto + kontrak W3):
//   - TLS 1.2+ wajib, tanpa InsecureSkipVerify; proxy lingkungan dimatikan.
//   - Timeout berlapis: dial, TLS handshake, response-header, total.
//   - Body respons dibatasi io.LimitReader (2 MiB).
//   - Maksimal 3 percobaan dengan exponential backoff + full jitter
//     (crypto/rand) untuk error transport/5xx/429.
//   - Autentikasi agent: HMAC-SHA256 per-request atas kanonis
//     "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}" dengan header
//     X-Agent-Id / X-Agent-Timestamp / X-Agent-Signature (window replay
//     ±30 s ditegakkan server).
//   - X-Correlation-ID (UUIDv7) disertakan & di-echo server.
//   - hmac_secret TIDAK PERNAH ditulis ke log.
package rustapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

const (
	// maxResponseBytes membatasi ukuran body respons (anti memory-bomb).
	maxResponseBytes = 2 << 20 // 2 MiB
	// maxAttempts = 1 percobaan awal + 2 retry (hanya transport/5xx/429).
	maxAttempts = 3
	// baseBackoff — jeda dasar exponential backoff (×2 per percobaan).
	baseBackoff = 500 * time.Millisecond
	// requestTimeout batas total satu request HTTP.
	requestTimeout = 15 * time.Second
	// userAgent identitas agent.
	userAgent = "omnisight-flow-worker/0.1.0"
)

// Konstanta method — menghindari string sihir tersebar.
const (
	httpMethodPost = "POST"
	httpMethodGet  = "GET"
)

// Client klien HTTP ke osc_rest dengan signing HMAC.
type Client struct {
	baseURL string
	agentID string
	secret  []byte
	logger  *slog.Logger
	http    *http.Client
}

// New membangun klien. agentID/secret kosong valid saat pra-enroll
// (endpoint /agents/enroll bersifat publik tanpa HMAC).
func New(baseURL, agentID, hmacSecret string, logger *slog.Logger) *Client {
	transport := &http.Transport{
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		IdleConnTimeout:       60 * time.Second,
		MaxIdleConns:          4,
		MaxIdleConnsPerHost:   2,
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		agentID: agentID,
		secret:  []byte(hmacSecret),
		logger:  logger,
		http: &http.Client{
			Transport: transport,
			Timeout:   requestTimeout,
		},
	}
}

// SetCredentials memasang kredensial hasil enrollment (in-memory saja).
func (c *Client) SetCredentials(agentID, hmacSecret string) {
	c.agentID = agentID
	c.secret = []byte(hmacSecret)
}

// SignEnvelope membangun string kanonis signature HMAC sesuai kontrak:
// "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}". Diekspor untuk pengujian
// vektor tetap.
func SignEnvelope(secret []byte, ts int64, method, path string, body []byte) string {
	bodyHash := sha256.Sum256(body)
	canonical := fmt.Sprintf("%d\n%s\n%s\n%s", ts, method, path, hex.EncodeToString(bodyHash[:]))
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// doRequest mengeksekusi satu request JSON dengan retry/backoff.
func (c *Client) doRequest(ctx context.Context, method, path string, body []byte, signed bool) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			// Exponential backoff + full jitter (crypto/rand).
			ceil := big.NewInt(int64(baseBackoff * (1 << (attempt - 1))))
			jitter, jerr := rand.Int(rand.Reader, ceil)
			if jerr != nil {
				return nil, fmt.Errorf("gagal generate jitter: %w", jerr)
			}
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(jitter.Int64())):
			}
		}

		data, retryable, err := c.attempt(ctx, method, path, body, signed)
		if err == nil {
			return data, nil
		}
		lastErr = err
		if !retryable {
			return nil, err
		}
		c.logger.Warn("request upstream gagal, mencoba ulang",
			"path", path, "attempt", attempt+1, "err", err.Error())
	}
	return nil, lastErr
}

// attempt satu percobaan; retryable=true berarti layak dicoba ulang
// (transport error / 5xx / 429).
func (c *Client) attempt(ctx context.Context, method, path string, body []byte, signed bool) ([]byte, bool, error) {
	reqCtx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, false, fmt.Errorf("membangun request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)

	corrID, err := uuidv7()
	if err != nil {
		return nil, false, fmt.Errorf("gagal generate correlation id: %w", err)
	}
	req.Header.Set("X-Correlation-ID", corrID)

	if signed {
		if c.agentID == "" || len(c.secret) == 0 {
			return nil, false, domain.ErrNotEnrolled
		}
		ts := time.Now().Unix()
		req.Header.Set("X-Agent-Id", c.agentID)
		req.Header.Set("X-Agent-Timestamp", fmt.Sprintf("%d", ts))
		req.Header.Set("X-Agent-Signature", SignEnvelope(c.secret, ts, method, path, body))
	}

	resp, err := c.http.Do(req)
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.Canceled) {
			return nil, false, err
		}
		return nil, true, fmt.Errorf("%w: %v", domain.ErrUnreachable, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, true, fmt.Errorf("%w: membaca respons: %v", domain.ErrInvalidResponse, err)
	}

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return data, false, nil
	case resp.StatusCode == http.StatusUnauthorized:
		return nil, false, fmt.Errorf("%w (HTTP 401): %s", domain.ErrUnauthorized, extractErrMsg(data))
	case resp.StatusCode == http.StatusTooManyRequests:
		return nil, true, fmt.Errorf("%w (HTTP 429): %s", domain.ErrRejected, extractErrMsg(data))
	case resp.StatusCode >= 500:
		return nil, true, fmt.Errorf("%w (HTTP %d): %s", domain.ErrUnreachable, resp.StatusCode, extractErrMsg(data))
	default:
		return nil, false, fmt.Errorf("%w (HTTP %d): %s", domain.ErrRejected, resp.StatusCode, extractErrMsg(data))
	}
}

// envelope mem-parsing bentuk respons standar osc_rest:
// {status, data:{…}} atau {status:"error", error:{code,message}}.
type envelope struct {
	Status string          `json:"status"`
	Data   json.RawMessage `json:"data"`
	Error  *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// extractErrMsg mengekstrak pesan error ringkas dari body (untuk log).
func extractErrMsg(body []byte) string {
	var env envelope
	if err := json.Unmarshal(body, &env); err == nil && env.Error != nil && env.Error.Message != "" {
		return env.Error.Message
	}
	if len(body) > 200 {
		return string(body[:200]) + "…"
	}
	return string(body)
}

// decodeEnvelope memvalidasi status dan mengembalikan data.
func decodeEnvelope(data []byte, wantStatus ...string) (json.RawMessage, error) {
	var env envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil, fmt.Errorf("%w: body bukan JSON valid: %v", domain.ErrInvalidResponse, err)
	}
	if env.Error != nil {
		return nil, fmt.Errorf("%w (%s): %s", domain.ErrRejected, env.Error.Code, env.Error.Message)
	}
	for _, s := range wantStatus {
		if env.Status == s {
			return env.Data, nil
		}
	}
	return nil, fmt.Errorf("%w: status=%q (harap %q)",
		domain.ErrInvalidResponse, env.Status, wantStatus)
}
