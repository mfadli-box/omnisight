// Package httpx — klien HTTP outbound hardened bersama untuk sender
// Telegram/webhook. Jaminan (standar skill ai-auto):
//   - TLS 1.2+ wajib, tanpa InsecureSkipVerify.
//   - Timeout berlapis: dial, TLS handshake, response-header, total.
//   - Proxy lingkungan dimatikan (server-to-server).
//   - Redirect TIDAK diikuti (anti SSRF lanjutan / anti kebocoran header).
//   - Body respons dibatasi io.LimitReader (1 MiB).
package httpx

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

const maxResponseBytes = 1 << 20 // 1 MiB

// Client wrapper *http.Client dengan profil aman.
type Client struct {
	http *http.Client
}

// New membangun klien dengan timeout total tertentu.
func New(timeout time.Duration) *Client {
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
	return &Client{http: &http.Client{
		Transport: transport,
		Timeout:   timeout,
		// Anti SSRF lanjutan: redirect tidak diikuti (URL channel sudah
		// divalidasi producer; token tidak boleh bocor ke host lain).
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}}
}

// Do mengeksekusi request dan mengembalikan body (terbatas). Error untuk
// semua status >= 300 (tanpa membocorkan body penuh).
func (c *Client) Do(ctx context.Context, method, url, contentType string, body []byte) ([]byte, error) {
	return c.DoWithHeaders(ctx, method, url, contentType, body, nil)
}

// DoWithHeaders — varian Do dengan header tambahan (mis. signature HMAC).
func (c *Client) DoWithHeaders(ctx context.Context, method, url, contentType string,
	body []byte, headers map[string]string) ([]byte, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("membangun request: %w", err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("User-Agent", "omnisight-flow-worker/0.1.0")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.Canceled) {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("%w: %v", errors.New("layanan upstream tidak terjangkau"), err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("membaca respons: %w", err)
	}
	if resp.StatusCode >= 300 {
		return data, fmt.Errorf("HTTP %d: %.200s", resp.StatusCode, string(data))
	}
	return data, nil
}
