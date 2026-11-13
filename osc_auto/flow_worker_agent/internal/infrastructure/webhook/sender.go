// Package webhook — pengirim webhook outbound generik (termasuk payload
// Slack-compatible).
//
// Jaminan:
//   - URL wajib http/https tanpa kredensial inline `user:pass@` (kontrak w3
//     menolak inline credential — divalidasi ulang di sini, deny-by-default).
//   - Bila config.secret diset, request ditandatangani HMAC-SHA256:
//     header `X-OmniSign: sha256=<hex(hmac(secret, body))>` — penerima dapat
//     memverifikasi keaslian (pola signing GitHub/Slack).
//   - Redirect tidak diikuti (httpx); body respons dibatasi LimitReader.
package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/httpx"
)

// Sender implementasi domain.Sender untuk channel WEBHOOK.
type Sender struct {
	api *httpx.Client
}

// New membangun sender dengan klien HTTP hardened.
func New() *Sender { return &Sender{api: httpx.New(15 * time.Second)} }

// Send POST payload JSON ke URL channel.
func (s *Sender) Send(ctx context.Context, ch domain.ChannelRef, msg domain.OutboundMessage) error {
	cfg := ch.Config
	if err := validateURL(cfg.URL); err != nil {
		return err
	}
	subject, body := domain.Render(msg)

	var payload []byte
	var err error
	if cfg.Slack {
		payload, err = json.Marshal(slackPayload{Text: subject + "\n" + body})
	} else {
		payload, err = json.Marshal(genericPayload{
			Event:   msg.Event,
			EventID: msg.EventID,
			Subject: subject,
			Body:    body,
			Data:    msg.Data,
		})
	}
	if err != nil {
		return fmt.Errorf("serialisasi webhook payload: %w", err)
	}

	headers := map[string]string{}
	if cfg.Secret != "" {
		mac := hmac.New(sha256.New, []byte(cfg.Secret))
		mac.Write(payload)
		headers["X-OmniSign"] = "sha256=" + hex.EncodeToString(mac.Sum(nil))
	}
	data, err := s.api.DoWithHeaders(ctx, "POST", cfg.URL, "application/json", payload, headers)
	if err != nil {
		return err
	}
	_ = data // body respons diabaikan (status 2xx = sukses)
	return nil
}

// slackPayload — format pesan incoming-webhook Slack.
type slackPayload struct {
	Text string `json:"text"`
}

// genericPayload — format generik omnisight.
type genericPayload struct {
	Event   string            `json:"event"`
	EventID string            `json:"event_id"`
	Subject string            `json:"subject"`
	Body    string            `json:"body"`
	Data    map[string]string `json:"data,omitempty"`
}

// validateURL — skema http(s), tanpa userinfo inline (anti credential leak
// & URL malformed), panjang ≤ 500 (kontrak w3).
func validateURL(raw string) error {
	if raw == "" {
		return fmt.Errorf("%w: webhook url kosong", domain.ErrInvalidMessage)
	}
	if len(raw) > 500 {
		return fmt.Errorf("%w: webhook url > 500 char", domain.ErrInvalidMessage)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("%w: webhook url tidak valid", domain.ErrInvalidMessage)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("%w: webhook url skema harus http/https", domain.ErrInvalidMessage)
	}
	if u.User != nil {
		return fmt.Errorf("%w: webhook url ber-kredensial inline (dilarang)", domain.ErrInvalidMessage)
	}
	if strings.TrimSpace(u.Hostname()) == "" {
		return fmt.Errorf("%w: webhook url tanpa host", domain.ErrInvalidMessage)
	}
	return nil
}
