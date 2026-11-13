package usecase

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

// --- Fake sender -------------------------------------------------------------

type fakeSender struct {
	err    error
	called int
	got    []domain.OutboundMessage
}

func (f *fakeSender) Send(_ context.Context, ch domain.ChannelRef, msg domain.OutboundMessage) error {
	f.called++
	f.got = append(f.got, msg)
	return f.err
}

// --- Fake queue (in-memory, deterministik) -----------------------------------

type fakeQueue struct {
	pending []domain.OutboundMessage
	acked   []string
	dead    int
	now     time.Time
}

func (f *fakeQueue) Enqueue(m domain.OutboundMessage) error {
	f.pending = append(f.pending, m)
	return nil
}

func (f *fakeQueue) ClaimDue(now time.Time, max int) []domain.OutboundMessage {
	n := max
	if len(f.pending) < n {
		n = len(f.pending)
	}
	out := f.pending[:n]
	f.pending = f.pending[n:]
	return out
}

func (f *fakeQueue) Ack(eventID string) { f.acked = append(f.acked, eventID) }

func (f *fakeQueue) Retry(m domain.OutboundMessage, _ time.Duration, maxAttempts int) bool {
	m.Attempts++
	if m.Attempts >= maxAttempts {
		f.dead++
		return false
	}
	f.pending = append(f.pending, m)
	return true
}

func (f *fakeQueue) Len() int { return len(f.pending) }

// --- Test dispatcher ----------------------------------------------------------

func smtpMsg(eventID string) domain.OutboundMessage {
	return domain.OutboundMessage{
		EventID: eventID,
		Event:   domain.EventAlertFiring,
		Channels: []domain.ChannelRef{
			{Type: domain.ChannelSMTP, Config: domain.ChannelConfig{
				Host: "smtp.corp.local", FromEmail: "noreply@corp.local",
			}, To: []string{"ops@corp.local"}},
		},
	}
}

// TestDeliverSuccess — pesan sukses → Ack, tidak ada retry.
func TestDeliverSuccess(t *testing.T) {
	q := &fakeQueue{}
	s := &fakeSender{}
	d := &Dispatcher{queue: q, senders: map[domain.ChannelType]domain.Sender{
		domain.ChannelSMTP: s,
	}, logger: testLogger(), maxAttempts: 5, workers: 1, tick: time.Millisecond, now: time.Now}

	msg := smtpMsg("evt-1")
	d.deliver(context.Background(), msg)

	if s.called != 1 {
		t.Fatalf("sender dipanggil %d kali (harus 1)", s.called)
	}
	if len(q.acked) != 1 || q.acked[0] != "evt-1" {
		t.Fatalf("Ack salah: %v", q.acked)
	}
	if len(q.pending) != 0 {
		t.Fatalf("pending harus kosong, ada %d", len(q.pending))
	}
}

// TestDeliverRetryThenDead — kegagalan → retry; habis percobaan → dead.
func TestDeliverRetryThenDead(t *testing.T) {
	q := &fakeQueue{}
	s := &fakeSender{err: errors.New("smtp down")}
	d := &Dispatcher{queue: q, senders: map[domain.ChannelType]domain.Sender{
		domain.ChannelSMTP: s,
	}, logger: testLogger(), maxAttempts: 3, workers: 1, tick: time.Millisecond, now: time.Now}

	msg := smtpMsg("evt-2")

	// Attempt 1 → retry (attempts 0 → 1).
	d.deliver(context.Background(), msg)
	if len(q.pending) != 1 {
		t.Fatalf("pesan harus dijadwalkan ulang")
	}
	// Attempt 2 (claim ulang seperti loop dispatcher nyata) → retry.
	next := q.ClaimDue(time.Now(), 1)
	if len(next) != 1 || next[0].Attempts != 1 {
		t.Fatalf("pesan claim ke-2 harus Attempts=1, nyata %+v", next)
	}
	d.deliver(context.Background(), next[0])
	if len(q.pending) != 1 {
		t.Fatalf("pesan harus dijadwalkan ulang (attempt 2)")
	}
	// Attempt 3 → dead (attempts 2 → 3 >= maxAttempts).
	last := q.ClaimDue(time.Now(), 1)
	d.deliver(context.Background(), last[0])
	if q.dead != 1 || len(q.pending) != 0 {
		t.Fatalf("pesan harus dead-letter: dead=%d pending=%d", q.dead, len(q.pending))
	}
	if s.called != 3 {
		t.Fatalf("sender harus dipanggil 3x, nyata %d", s.called)
	}
}

// TestDeliverUnknownChannel — tipe channel tak dikenal → error (retry).
func TestDeliverUnknownChannel(t *testing.T) {
	q := &fakeQueue{}
	d := &Dispatcher{queue: q, senders: map[domain.ChannelType]domain.Sender{},
		logger: testLogger(), maxAttempts: 5, workers: 1, tick: time.Millisecond, now: time.Now}

	msg := smtpMsg("evt-3")
	msg.Channels[0].Type = "PAGERDUTY"
	d.deliver(context.Background(), msg)

	if len(q.pending) != 1 {
		t.Fatalf("pesan harus diretry bila tipe channel tidak dikenal")
	}
}

// TestDeliverEventFilter — channel dengan event_filter tidak cocok → ack
// tanpa kirim.
func TestDeliverEventFilter(t *testing.T) {
	q := &fakeQueue{}
	s := &fakeSender{}
	d := &Dispatcher{queue: q, senders: map[domain.ChannelType]domain.Sender{
		domain.ChannelSMTP: s,
	}, logger: testLogger(), maxAttempts: 5, workers: 1, tick: time.Millisecond, now: time.Now}

	msg := smtpMsg("evt-4")
	msg.Channels[0].EventFilter = []string{"SIEM.CRITICAL"}
	d.deliver(context.Background(), msg)

	if s.called != 0 {
		t.Fatalf("sender tidak boleh dipanggil bila event tidak berlangganan")
	}
	if len(q.acked) != 1 {
		t.Fatalf("pesan tanpa channel berlangganan harus di-ack")
	}
}

// TestRenderMfaResetToken — template email reset MFA memuat token & TTL.
func TestRenderMfaResetToken(t *testing.T) {
	msg := domain.OutboundMessage{
		EventID:  "evt-5",
		Event:    domain.EventMFAResetToken,
		Data:     map[string]string{"token": "abcdef123456", "ttl_minutes": "10", "user": "budi@corp.local"},
		Channels: []domain.ChannelRef{{Type: domain.ChannelSMTP, To: []string{"budi@corp.local"}}},
	}
	subject, body := domain.Render(msg)
	if subject != "Reset MFA — omnisight" {
		t.Fatalf("subjek salah: %q", subject)
	}
	for _, want := range []string{"abcdef123456", "10 menit", "budi@corp.local"} {
		if !contains(body, want) {
			t.Fatalf("body harus memuat %q:\n%s", want, body)
		}
	}
}

// TestRenderDefaults — event tak dikenal tetap dirender (subjek generik).
func TestRenderDefaults(t *testing.T) {
	subject, body := domain.Render(domain.OutboundMessage{Event: "UNKNOWN.EVENT", Data: map[string]string{"a": "1"}})
	if subject == "" || body == "" {
		t.Fatalf("render default harus menghasilkan subjek+body")
	}
}

// TestBackoffBound — backoff tidak melewati plafon.
func TestBackoffBound(t *testing.T) {
	for attempt := 0; attempt < 15; attempt++ {
		if d := backoff(attempt); d > maxBackoff || d < 0 {
			t.Fatalf("backoff(%d)=%v melewati plafon %v", attempt, d, maxBackoff)
		}
	}
}

// TestValidateSenderRegistry — registry lengkap diterima, kurang → error.
func TestValidateSenderRegistry(t *testing.T) {
	full := map[domain.ChannelType]domain.Sender{
		domain.ChannelSMTP:     &fakeSender{},
		domain.ChannelTelegram: &fakeSender{},
		domain.ChannelWebhook:  &fakeSender{},
	}
	if err := ValidateSenderRegistry(full); err != nil {
		t.Fatalf("registry lengkap harus valid: %v", err)
	}
	delete(full, domain.ChannelTelegram)
	if err := ValidateSenderRegistry(full); err == nil {
		t.Fatalf("registry tanpa TELEGRAM harus error")
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(&nullWriter{}, &slog.HandlerOptions{Level: slog.LevelError}))
}

type nullWriter struct{}

func (*nullWriter) Write(p []byte) (int, error) { return len(p), nil }
