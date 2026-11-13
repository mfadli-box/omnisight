package domain

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

// ChannelType — tipe channel notifikasi (kontrak w3.openapi.yaml
// NotificationChannelView.type).
type ChannelType string

const (
	ChannelSMTP     ChannelType = "SMTP_EMAIL"
	ChannelTelegram ChannelType = "TELEGRAM"
	ChannelWebhook  ChannelType = "WEBHOOK"
)

// Kode event (event_filter channel — uppercase; lihat api-w3.md §CRUD
// notifications/channels dan reengineering.md bab 5.8).
const (
	EventAlertFiring     = "ALERT.FIRING"           // metrik breach (termasuk disk penuh)
	EventAlertResolved   = "ALERT.RESOLVED"         // pemulihan alert
	EventSIEMCritical    = "SIEM.CRITICAL"          // temuan SIEM severity CRITICAL
	EventUptimeDown      = "UPTIME.DOWN"            // downtime monitor uptime
	EventUptimeUp        = "UPTIME.UP"              // pemulihan monitor
	EventMFAResetToken   = "MFA.RESET_TOKEN"        // email token reset MFA (sekali pakai)
	EventPAMSessionAuth  = "PAM.SESSION_AUTHORIZED" // audit sesi bastion
	EventRetentionPurge  = "RETENTION.PURGE"        // laporan hasil purge retensi
	EventWebhookOutbound = "WEBHOOK.OUTBOUND"       // webhook keluar generik
)

// ChannelConfig — konfigurasi channel (mirror ChannelConfig pada
// w3.openapi.yaml). Secret (password/bot_token/secret) hanya hidup di
// memori dan antrean terenkripsi — TIDAK PERNAH di-log.
type ChannelConfig struct {
	// SMTP_EMAIL
	Host      string `json:"host,omitempty"`
	Port      int    `json:"port,omitempty"`
	Username  string `json:"username,omitempty"`
	Password  string `json:"password,omitempty"`
	FromEmail string `json:"from_email,omitempty"`
	UseTLS    bool   `json:"use_tls,omitempty"`

	// TELEGRAM
	BotToken  string `json:"bot_token,omitempty"`
	ChatID    string `json:"chat_id,omitempty"`
	ParseMode string `json:"parse_mode,omitempty"`

	// WEBHOOK (Slack-compatible bila Slack=true)
	URL    string `json:"url,omitempty"`
	Secret string `json:"secret,omitempty"`
	Slack  bool   `json:"slack,omitempty"`
}

// smtpPortDefault — port SMTP submission default (kontrak w3: default 587).
const smtpPortDefault = 587

// Addr mengembalikan host:port SMTP (port default 587).
func (c ChannelConfig) Addr() string {
	port := c.Port
	if port <= 0 || port > 65535 {
		port = smtpPortDefault
	}
	return fmt.Sprintf("%s:%d", c.Host, port)
}

// ChannelRef — channel target tunggal untuk satu pesan.
type ChannelRef struct {
	Type        ChannelType   `json:"type"`
	Config      ChannelConfig `json:"config"`
	To          []string      `json:"to,omitempty"`           // email tujuan (SMTP)
	EventFilter []string      `json:"event_filter,omitempty"` // uppercase; kosong = semua event
}

// MatchesEvent — true bila channel berlangganan kode event tsb.
func (c ChannelRef) MatchesEvent(event string) bool {
	if len(c.EventFilter) == 0 {
		return true
	}
	for _, e := range c.EventFilter {
		if strings.EqualFold(strings.TrimSpace(e), event) {
			return true
		}
	}
	return false
}

// OutboundMessage — satu pesan notifikasi (unit kerja dispatcher).
// Field Attempts/NextAttemptAt/EnqueuedAt dikelola antrean lokal; field
// wire mengikuti konvensi snake_case kontrak w3.
type OutboundMessage struct {
	EventID  string            `json:"event_id"` // uuid dari produsen — kunci dedupe
	Event    string            `json:"event"`    // kode event (EventAlertFiring, …)
	Subject  string            `json:"subject,omitempty"`
	Body     string            `json:"body,omitempty"`
	Data     map[string]string `json:"data,omitempty"` // field template (token, host, rule, …)
	Channels []ChannelRef      `json:"channels"`

	// State retry internal (tidak dikirim produsen).
	Attempts      int       `json:"attempts,omitempty"`
	NextAttemptAt time.Time `json:"next_attempt_at,omitempty"`
	EnqueuedAt    time.Time `json:"enqueued_at"`
}

// Validate — invariant minimal pesan.
func (m OutboundMessage) Validate() error {
	if strings.TrimSpace(m.EventID) == "" {
		return fmt.Errorf("%w: event_id kosong", ErrInvalidMessage)
	}
	if len(m.EventID) > 128 {
		return fmt.Errorf("%w: event_id > 128 char", ErrInvalidMessage)
	}
	if strings.TrimSpace(m.Event) == "" {
		return fmt.Errorf("%w: event kosong", ErrInvalidMessage)
	}
	if len(m.Channels) == 0 {
		return fmt.Errorf("%w: tanpa channel target", ErrInvalidMessage)
	}
	if len(m.Channels) > 32 {
		return fmt.Errorf("%w: channel > 32", ErrInvalidMessage)
	}
	return nil
}

// Rendered — subjek + body final setelah template (murni, tanpa I/O).
func Render(m OutboundMessage) (subject, body string) {
	if m.Subject != "" && m.Body != "" {
		return m.Subject, m.Body
	}
	s, b := renderTemplate(m)
	if m.Subject != "" {
		s = m.Subject
	}
	if m.Body != "" {
		b = m.Body
	}
	return s, b
}

// renderTemplate — registry template default per kode event. Field diambil
// dari Data; field yang hilang dirender kosong (tanpa panic). Token reset
// MFA hanya masuk body email — tidak pernah di-log (dispatcher hanya
// me-log event_id/event).
func renderTemplate(m OutboundMessage) (string, string) {
	d := m.Data
	get := func(k string) string { return strings.TrimSpace(d[k]) }

	switch m.Event {
	case EventMFAResetToken:
		return "Reset MFA — omnisight", strings.Join([]string{
			"Permintaan reset MFA diterima untuk akun: " + orDefault(get("user"), "-"),
			"",
			"Token reset (sekali pakai): " + get("token"),
			"Masa berlaku: " + orDefault(get("ttl_minutes"), "10") + " menit.",
			"",
			"Abaikan email ini bila Anda tidak meminta reset. Token dapat digunakan",
			"sekali pada halaman konfirmasi reset MFA omnisight.",
		}, "\n")
	case EventUptimeDown:
		return "[DOWNTIME] " + orDefault(get("monitor"), "monitor tidak diketahui"),
			strings.Join([]string{
				"Monitor: " + orDefault(get("monitor"), "-"),
				"Target : " + orDefault(get("target"), "-"),
				"Error  : " + orDefault(get("error"), "-"),
				"Sejak  : " + orDefault(get("since"), time.Now().UTC().Format(time.RFC3339)),
			}, "\n")
	case EventUptimeUp:
		return "[RECOVERED] " + orDefault(get("monitor"), "monitor tidak diketahui"),
			strings.Join([]string{
				"Monitor kembali UP: " + orDefault(get("monitor"), "-"),
				"Target : " + orDefault(get("target"), "-"),
				"Downtime: " + orDefault(get("downtime"), "-"),
			}, "\n")
	case EventSIEMCritical:
		return "[SIEM CRITICAL] " + orDefault(get("rule_name"), "temuan keamanan"),
			strings.Join([]string{
				"Rule    : " + orDefault(get("rule_name"), "-"),
				"Host    : " + orDefault(get("asset_name"), "-"),
				"Path    : " + orDefault(get("path"), "-"),
				"MITRE   : " + orDefault(get("mitre_tactic"), "-") + " / " + orDefault(get("mitre_technique"), "-"),
				"SourceIP: " + orDefault(get("source_ip"), "-"),
				"Waktu   : " + orDefault(get("detected_at"), time.Now().UTC().Format(time.RFC3339)),
			}, "\n")
	case EventAlertFiring:
		return "[ALERT " + orDefault(get("severity"), "HIGH") + "] " + orDefault(get("rule"), "alert metrik"),
			strings.Join([]string{
				"Rule    : " + orDefault(get("rule"), "-"),
				"Host    : " + orDefault(get("host"), "-"),
				"Metrik  : " + orDefault(get("metric"), "-") + " = " + orDefault(get("value"), "-"),
				"Durasi  : " + orDefault(get("duration"), "-"),
				"Pesan   : " + orDefault(get("message"), "-"),
			}, "\n")
	case EventAlertResolved:
		return "[RESOLVED] " + orDefault(get("rule"), "alert metrik"),
			"Alert pulih: " + orDefault(get("rule"), "-") + " pada " + orDefault(get("host"), "-")
	case EventPAMSessionAuth:
		return "[PAM] Sesi bastion diotorisasi",
			strings.Join([]string{
				"Akun   : " + orDefault(get("account_label"), "-"),
				"Target : " + orDefault(get("target"), "-"),
				"User   : " + orDefault(get("requested_by"), "-"),
				"Sesi   : " + orDefault(get("session_id"), "-"),
			}, "\n")
	case EventRetentionPurge:
		return "[RETENTION] Purge data selesai",
			"Hasil purge: " + formatCounts(d)
	case EventWebhookOutbound:
		return orDefault(m.Subject, "[WEBHOOK] "+orDefault(get("title"), "notifikasi outbound")),
			m.Body
	default:
		return "[omnisight] " + m.Event, dumpData(d)
	}
}

// formatCounts — render map hitungan (mis. hasil purge) deterministik.
func formatCounts(d map[string]string) string {
	keys := make([]string, 0, len(d))
	for k := range d {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+d[k])
	}
	return strings.Join(parts, ", ")
}

func dumpData(d map[string]string) string {
	if len(d) == 0 {
		return "(tanpa detail)"
	}
	return formatCounts(d)
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

// --- Port (implementasi di infrastructure) ---------------------------------

// Sender — pengirim notifikasi untuk satu tipe channel. Implementasi WAJIB
// idempoten-aman (retry dispatcher boleh memanggil ulang).
type Sender interface {
	Send(ctx context.Context, ch ChannelRef, msg OutboundMessage) error
}

// MessageQueue — antrean durable lokal (enqueue/claim/ack/retry + dedupe).
type MessageQueue interface {
	// Enqueue menambah pesan; ErrDuplicated bila event_id sudah diproses,
	// ErrQueueFull bila antrean penuh.
	Enqueue(m OutboundMessage) error
	// ClaimDue mengambil maksimal max pesan yang jatuh tempo dikirim.
	ClaimDue(now time.Time, max int) []OutboundMessage
	// Ack menandai pesan sukses (hapus + simpan dedupe).
	Ack(eventID string)
	// Retry menjadwalkan ulang pesan; bila attempts >= maxAttempts pesan
	// dibuang (dead-letter) dan dikembalikan false.
	Retry(m OutboundMessage, delay time.Duration, maxAttempts int) bool
	// Len — jumlah pesan pending.
	Len() int
}

// RetentionClient — port purge retensi ke osc_rest.
type RetentionClient interface {
	// PurgeRetention memicu POST /api/v1/agents/retention/purge.
	PurgeRetention(ctx context.Context, dryRun bool) (map[string]int64, error)
}

// RustAPIClient — port enrollment (dipakai --enroll).
type RustAPIClient interface {
	Enroll(ctx context.Context, req EnrollRequest) (Credentials, error)
}
