// Package telegram — pengirim alert via Bot API Telegram.
//
// Jaminan:
//   - Token bot hanya di URL path request — TIDAK PERNAH di-log (error
//     hanya menyertakan status + deskripsi respons Telegram).
//   - Text dibatasi 4096 karakter (batas API; dipotong).
//   - parse_mode hanya diteruskan bila termasuk allowlist API.
package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/httpx"
)

// textLimit — batas panjang pesan Telegram.
const textLimit = 4096

// Sender implementasi domain.Sender untuk channel TELEGRAM.
type Sender struct {
	api *httpx.Client
}

// New membangun sender dengan klien HTTP hardened.
func New() *Sender { return &Sender{api: httpx.New(15 * time.Second)} }

// telegramResponse — subset respons Bot API.
type telegramResponse struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
}

type sendMessageRequest struct {
	ChatID    string `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode,omitempty"`
}

// Send mengirim pesan ke chat_id config.
func (s *Sender) Send(ctx context.Context, ch domain.ChannelRef, msg domain.OutboundMessage) error {
	cfg := ch.Config
	if strings.TrimSpace(cfg.BotToken) == "" || strings.TrimSpace(cfg.ChatID) == "" {
		return fmt.Errorf("%w: telegram bot_token/chat_id kosong", domain.ErrInvalidMessage)
	}
	subject, body := domain.Render(msg)
	text := truncate(subject+"\n\n"+body, textLimit)

	req := sendMessageRequest{ChatID: cfg.ChatID, Text: text, ParseMode: allowedParseMode(cfg.ParseMode)}
	payload, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("serialisasi telegram payload: %w", err)
	}

	url := "https://api.telegram.org/bot" + cfg.BotToken + "/sendMessage"
	data, err := s.api.Do(ctx, "POST", url, "application/json", payload)
	if err != nil {
		return err
	}
	var res telegramResponse
	if err := json.Unmarshal(data, &res); err != nil {
		return fmt.Errorf("%w: telegram respons tidak valid: %v", domain.ErrInvalidResponse, err)
	}
	if !res.OK {
		return fmt.Errorf("%w: telegram: %s", domain.ErrRejected, res.Description)
	}
	return nil
}

// allowedParseMode — allowlist parse_mode API (selain itu plaintext).
func allowedParseMode(mode string) string {
	switch strings.ToUpper(strings.TrimSpace(mode)) {
	case "HTML":
		return "HTML"
	case "MARKDOWN":
		return "Markdown"
	case "MARKDOWNV2":
		return "MarkdownV2"
	default:
		return ""
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
