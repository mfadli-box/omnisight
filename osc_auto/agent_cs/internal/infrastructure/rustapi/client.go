// Package rustapi — adapter klien HTTP hardened untuk berbicara dengan
// osc_rest (implementasi port domain.RustAPIProbe).
//
// Jaminan (standar skill ai-auto):
//   - TLS 1.2+ wajib (tls.Config.MinVersion), tanpa InsecureSkipVerify.
//   - Timeout berlapis: dial, TLS handshake, response header, dan total.
//   - Proxy lingkungan dimatikan (trafik server-to-server internal).
//   - Body respons dibatasi io.LimitReader (1 MiB) — anti memory-bomb.
//   - Maksimal 3 percobaan dengan exponential backoff + full jitter
//     (sumber keacakan crypto/rand, bukan math/rand).
//   - Token auth dari environment; TIDAK PERNAH ditulis ke log.
package rustapi

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/domain"
)

const (
	// maxResponseBytes membatasi ukuran body respons (anti memory-bomb).
	maxResponseBytes = 1 << 20 // 1 MiB
	// maxAttempts = 1 percobaan awal + 2 retry.
	maxAttempts = 3
	// probeTimeout adalah batas total satu request HTTP.
	probeTimeout = 10 * time.Second
	// userAgent identitas agent (tanpa detail internal).
	userAgent = "omnisight-agent_cs"
)

// healthPayload adalah kontrak GET /api/v1/health
// (osc_docs/rest/api-core-foundation.md). Field JSON di luar kontrak
// diabaikan agar agent tahan terhadap penambahan checks baru.
type healthPayload struct {
	Status string `json:"status"`
	Checks struct {
		Database string `json:"database"`
		Storage  string `json:"storage"`
	} `json:"checks"`
}

// Client klien HTTP ke osc_rest.
type Client struct {
	baseURL string
	token   string
	logger  *slog.Logger
	http    *http.Client
}

// New membangun klien. token kosong berarti tanpa header Authorization
// (dipakai selama /api/v1/health masih public, sebelum fase auth).
func New(baseURL, token string, logger *slog.Logger) *Client {
	transport := &http.Transport{
		// Server-to-server internal: abaikan proxy lingkungan
		// (HTTP(S)_PROXY) agar trafik tidak menyimpang ke proxy eksternal.
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSClientConfig: &tls.Config{
			// TLS 1.2+ wajib; verifikasi sertifikat sistem dipakai apa adanya.
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
		token:   token,
		logger:  logger,
		http: &http.Client{
			Transport: transport,
			Timeout:   probeTimeout, // batas total per request
		},
	}
}

// ProbeHealth menanyakan GET /api/v1/health dan memetakan hasilnya ke
// domain.ServiceHealth. 200 → ok; 503 dengan body degraded → degraded
// (service TERJANGKAU tetapi dependensinya turun). Error transport →
// ErrUnreachable; kontrak salah → ErrInvalidResponse.
func (c *Client) ProbeHealth(ctx context.Context) (domain.ServiceHealth, error) {
	body, err := c.getWithRetry(ctx, "/api/v1/health")
	if err != nil {
		return domain.ServiceHealth{Service: "osc_rest", Reachable: false}, err
	}

	payload, err := parseHealth(body)
	if err != nil {
		return domain.ServiceHealth{Service: "osc_rest", Reachable: false}, err
	}

	c.logger.Debug("health osc_rest",
		"status", payload.Status,
		"database", payload.Checks.Database,
		"storage", payload.Checks.Storage,
	)
	return domain.ServiceHealth{
		Service:   "osc_rest",
		Status:    payload.Status,
		Reachable: true,
	}, nil
}

// getWithRetry menjalankan percobaan GET dengan exponential backoff
// ber-jitter; hanya kegagalan yang layak diulang (transport, 5xx, 429)
// yang di-retry. Kegagalan kontrak langsung dikembalikan tanpa retry.
func (c *Client) getWithRetry(ctx context.Context, path string) ([]byte, error) {
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if attempt > 1 {
			delay := jitteredBackoff(attempt - 1)
			c.logger.Warn("percobaan ulang ke osc_rest",
				"attempt", attempt, "delay", delay.String())
			timer := time.NewTimer(delay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, fmt.Errorf("%w: %v", domain.ErrUnreachable, ctx.Err())
			case <-timer.C:
			}
		}

		body, retryable, err := c.attempt(ctx, path)
		if err == nil {
			return body, nil
		}
		if ctx.Err() != nil {
			return nil, fmt.Errorf("%w: %v", domain.ErrUnreachable, ctx.Err())
		}
		lastErr = err
		if !retryable {
			break
		}
		c.logger.Warn("request ke osc_rest gagal", "attempt", attempt, "err", err)
	}

	if lastErr == nil { // defensif; tidak seharusnya terjadi
		lastErr = domain.ErrUnreachable
	}
	return nil, lastErr
}

// attempt menjalankan satu request. Nilai balik retryable menandakan
// kegagalan sifatnya transient (layak diulang); selain itu kegagalan
// bersifat permanen (kontrak/konfigurasi salah).
func (c *Client) attempt(ctx context.Context, path string) (body []byte, retryable bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		// baseURL rusak (URL tidak valid) — salah konfigurasi, bukan transient.
		return nil, false, fmt.Errorf("%w: URL dasar tidak valid", domain.ErrInvalidResponse)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", userAgent)
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token) // tidak pernah di-log
	}

	resp, err := c.http.Do(req)
	if err != nil {
		// Transport (dial/TLS/timeout/reset) — layak diulang.
		return nil, true, fmt.Errorf("%w: %v", domain.ErrUnreachable, err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxResponseBytes))
		_ = resp.Body.Close()
	}()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, true, fmt.Errorf("%w: membaca body: %v", domain.ErrUnreachable, err)
	}

	switch {
	case resp.StatusCode == http.StatusOK:
		// 200: kontrak health normal (status ok|degraded).
		return raw, false, nil
	case resp.StatusCode == http.StatusServiceUnavailable:
		// 503 dari osc_rest sendiri membawa body {"status":"degraded"};
		// 503 dari reverse proxy membawa body lain. Bila body-nya valid
		// degraded → jawaban final (TIDAK perlu retry); bila bukan →
		// gangguan jaringan/proxy → layak diulang.
		if p, perr := parseHealth(raw); perr == nil && p.Status == "degraded" {
			return raw, false, nil
		}
		return nil, true, fmt.Errorf("%w: HTTP 503 tanpa body degraded", domain.ErrUnreachable)
	case resp.StatusCode >= 500, resp.StatusCode == http.StatusTooManyRequests:
		return nil, true, fmt.Errorf("%w: HTTP %d", domain.ErrUnreachable, resp.StatusCode)
	default:
		// 3xx/4xx lain: endpoint salah / misconfig — tidak ada gunanya diulang.
		return nil, false, fmt.Errorf("%w: HTTP %d", domain.ErrInvalidResponse, resp.StatusCode)
	}
}

// parseHealth memvalidasi payload health: status wajib ok|degraded.
func parseHealth(raw []byte) (healthPayload, error) {
	var payload healthPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return payload, fmt.Errorf("%w: body bukan JSON health yang valid", domain.ErrInvalidResponse)
	}
	switch payload.Status {
	case "ok", "degraded":
		return payload, nil
	default:
		return payload, fmt.Errorf("%w: status tidak dikenal %q", domain.ErrInvalidResponse, payload.Status)
	}
}

// jitteredBackoff menghasilkan full jitter [0, base] dengan base
// 500ms * 2^(attempt-1) (500ms, 1s, 2s, maksimum cap 4s); sumber keacakan
// crypto/rand agar bebas dari seed lemah math/rand.
func jitteredBackoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if attempt > 4 {
		attempt = 4
	}
	base := int64(500*time.Millisecond) << (attempt - 1)
	n, err := rand.Int(rand.Reader, big.NewInt(base+1))
	if err != nil {
		return time.Duration(base) // fallback deterministik bila entropy gagal
	}
	return time.Duration(n.Int64())
}
