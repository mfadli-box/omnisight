// Package smtp — pengirim email via net/smtp (stdlib, tanpa CGO).
//
// Jaminan keamanan:
//   - Port 465 → implicit TLS sejak koneksi pertama (tls.Client).
//   - Port lain + use_tls → STARTTLS WAJIB (gagal bila server tidak
//     menawarkan) — kredensial tidak pernah dikirim plaintext.
//   - AUTH PLAIN hanya ditawarkan setelah sesi ter-TLS (net/smtp menolak
//     auth tanpa TLS secara default).
//   - ServerName diset eksplisit (anti MITM pada handshake TLS).
//   - Timeout koneksi & command via deadline koneksi.
package smtp

import (
	"context"
	"crypto/tls"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

// commandTimeout — batas waktu satu transaksi SMTP (dial s.d. Quit).
const commandTimeout = 30 * time.Second

// Sender implementasi domain.Sender untuk channel SMTP_EMAIL.
type Sender struct{}

// New membangun sender SMTP.
func New() *Sender { return &Sender{} }

// Send mengirim email. Recipients dari ch.To (wajib ≥1); from dari
// config.from_email (wajib).
func (s *Sender) Send(ctx context.Context, ch domain.ChannelRef, msg domain.OutboundMessage) error {
	cfg := ch.Config
	if strings.TrimSpace(cfg.Host) == "" {
		return fmt.Errorf("%w: smtp host kosong", domain.ErrInvalidMessage)
	}
	if cfg.FromEmail == "" {
		return fmt.Errorf("%w: smtp from_email kosong", domain.ErrInvalidMessage)
	}
	if len(ch.To) == 0 {
		return fmt.Errorf("%w: smtp tanpa penerima", domain.ErrInvalidMessage)
	}
	subject, body := domain.Render(msg)

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", cfg.Addr())
	if err != nil {
		return fmt.Errorf("%w: smtp dial: %v", domain.ErrUnreachable, err)
	}
	_ = conn.SetDeadline(time.Now().Add(commandTimeout))

	host, _, _ := net.SplitHostPort(cfg.Addr())
	tlsCfg := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}

	var client *smtp.Client
	if cfg.Port == 465 {
		// Implicit TLS (SMTPS) — sesi terenkripsi sejak handshake.
		conn = tls.Client(conn, tlsCfg)
		client, err = smtp.NewClient(conn, host)
	} else {
		client, err = smtp.NewClient(conn, host)
	}
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("%w: smtp handshake: %v", domain.ErrUnreachable, err)
	}
	defer client.Close()

	// STARTTLS wajib untuk port non-465 bila use_tls (default true saat auth).
	if cfg.Port != 465 {
		ok, _ := client.Extension("STARTTLS")
		if cfg.UseTLS || cfg.Username != "" {
			if !ok {
				return fmt.Errorf("smtp: server tidak mendukung STARTTLS (use_tls=true)")
			}
			if err := client.StartTLS(tlsCfg); err != nil {
				return fmt.Errorf("%w: smtp starttls: %v", domain.ErrUnreachable, err)
			}
		}
	}

	// Auth hanya setelah sesi terenkripsi.
	if cfg.Username != "" {
		ok, _ := client.Extension("AUTH")
		if !ok {
			return fmt.Errorf("%w: smtp server tidak mendukung AUTH", domain.ErrRejected)
		}
		auth := smtp.PlainAuth("", cfg.Username, cfg.Password, host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("%w: smtp auth: %v", domain.ErrUnauthorized, err)
		}
	}

	if err := client.Mail(cfg.FromEmail); err != nil {
		return fmt.Errorf("%w: smtp MAIL FROM: %v", domain.ErrRejected, err)
	}
	for _, rcpt := range ch.To {
		if strings.TrimSpace(rcpt) == "" {
			continue
		}
		if err := client.Rcpt(strings.TrimSpace(rcpt)); err != nil {
			return fmt.Errorf("%w: smtp RCPT TO: %v", domain.ErrRejected, err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("%w: smtp DATA: %v", domain.ErrUnreachable, err)
	}
	if _, err := w.Write(buildMessage(cfg.FromEmail, ch.To, subject, body, msg.EventID)); err != nil {
		_ = w.Close()
		return fmt.Errorf("smtp menulis body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp finalisasi DATA: %w", err)
	}
	if err := client.Quit(); err != nil {
		// Best-effort: pesan sudah diterima (DATA selesai) — jangan retry.
		return nil
	}
	return nil
}

// buildMessage merakit email RFC 5322 (header CRLF + body).
func buildMessage(from string, to []string, subject, body, eventID string) []byte {
	var b strings.Builder
	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: " + strings.Join(to, ", ") + "\r\n")
	b.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n")
	b.WriteString("Date: " + time.Now().UTC().Format(time.RFC1123Z) + "\r\n")
	b.WriteString("Message-ID: <" + sanitizeMsgID(eventID) + "@flow_worker_agent>\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	b.WriteString("X-OmniEvent: " + sanitizeHeader(eventID) + "\r\n")
	b.WriteString("\r\n")
	b.WriteString(strings.ReplaceAll(body, "\r\n", "\n"))
	b.WriteString("\r\n")
	return []byte(b.String())
}

// sanitizeMsgID — buang karakter yang tidak sah pada Message-ID.
func sanitizeMsgID(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '.', r == '-', r == '_':
			return r
		default:
			return -1
		}
	}, s)
}

// sanitizeHeader — buang CRLF (anti header injection dari field produsen).
func sanitizeHeader(s string) string {
	return strings.NewReplacer("\r", "", "\n", "").Replace(s)
}
