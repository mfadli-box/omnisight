// Package usecase — Notification Dispatcher: worker pool terbatas yang
// mengirim pesan dari antrean durable ke channel (SMTP/Telegram/Webhook)
// dengan retry exponential-backoff + jitter, dedupe event_id, dan
// dead-letter setelah habis percobaan.
//
// Jaminan keamanan:
//   - Secret channel (password/bot_token/webhook secret) TIDAK PERNAH
//     di-log — log hanya event_id/event/err.
//   - Token reset MFA (EventMFAResetToken) hanya masuk body email — field
//     data.token tidak pernah dirender ke log.
//   - Bounded pool: maksimal workers goroutine pengirim + buffer job.
package usecase

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

// Konstanta perilaku retry.
const (
	// baseBackoff — jeda dasar antar percobaan (×2 per attempt).
	baseBackoff = 30 * time.Second
	// maxBackoff — plafon jeda retry.
	maxBackoff = 15 * time.Minute
	// defaultMaxAttempts — 1 kirim awal + 4 retry.
	defaultMaxAttempts = 5
	// jobBuffer — buffer channel job (bounded).
	jobBuffer = 256
)

// Dispatcher orkestrasi pengiriman.
type Dispatcher struct {
	queue       domain.MessageQueue
	senders     map[domain.ChannelType]domain.Sender
	logger      *slog.Logger
	workers     int
	maxAttempts int
	tick        time.Duration
	now         domain.Now
}

// NewDispatcher membangun dispatcher. workers ≤ 0 → 4; maxAttempts ≤ 0 → 5;
// tick ≤ 0 → 1 s.
func NewDispatcher(q domain.MessageQueue, senders map[domain.ChannelType]domain.Sender,
	workers, maxAttempts int, tick time.Duration, logger *slog.Logger) *Dispatcher {
	if workers <= 0 || workers > 64 {
		workers = 4
	}
	if maxAttempts <= 0 || maxAttempts > 20 {
		maxAttempts = defaultMaxAttempts
	}
	if tick <= 0 || tick > time.Minute {
		tick = time.Second
	}
	return &Dispatcher{
		queue:       q,
		senders:     senders,
		logger:      logger,
		workers:     workers,
		maxAttempts: maxAttempts,
		tick:        tick,
		now:         time.Now,
	}
}

// Run menjalankan loop claim + pool pengirim sampai ctx dibatalkan; drain
// job in-flight sebelum kembali (graceful shutdown).
func (d *Dispatcher) Run(ctx context.Context) {
	jobs := make(chan domain.OutboundMessage, jobBuffer)
	var wg sync.WaitGroup
	for i := 0; i < d.workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for msg := range jobs {
				d.deliver(ctx, msg)
			}
		}()
	}

	ticker := time.NewTicker(d.tick)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			close(jobs) // drain: worker menyelesaikan job in-flight
			wg.Wait()
			d.logger.Info("dispatcher berhenti", "pending", d.queue.Len())
			return
		case <-ticker.C:
			for _, msg := range d.queue.ClaimDue(d.now(), d.workers*2) {
				select {
				case jobs <- msg:
				case <-ctx.Done():
				}
			}
		}
	}
}

// deliver — satu upaya pengiriman semua channel pesan (dipanggil worker).
// Sukses = semua channel non-filter sukses terkirim.
func (d *Dispatcher) deliver(ctx context.Context, msg domain.OutboundMessage) {
	log := d.logger.With("event_id", msg.EventID, "event", msg.Event)

	var sendErr error
	channels := 0
	for _, ch := range msg.Channels {
		if !ch.MatchesEvent(msg.Event) {
			continue // channel tidak berlangganan event ini
		}
		sender, ok := d.senders[ch.Type]
		if !ok {
			sendErr = fmt.Errorf("tipe channel tidak dikenal: %s", ch.Type)
			break
		}
		channels++
		if err := sender.Send(ctx, ch, msg); err != nil {
			sendErr = err
			break
		}
	}

	// Tidak ada channel yang berlangganan → pesan selesai tanpa kirim.
	if sendErr == nil && channels == 0 {
		log.Debug("tidak ada channel berlangganan event — selesai")
		d.queue.Ack(msg.EventID)
		return
	}

	if sendErr == nil {
		log.Info("notifikasi terkirim", "channels", channels)
		d.queue.Ack(msg.EventID)
		return
	}

	// Redact detail: cukup error sender (sender tidak menulis secret).
	log.Warn("pengiriman gagal — dijadwalkan ulang",
		"attempt", msg.Attempts+1, "err", sendErr.Error())
	delay := backoff(msg.Attempts)
	if !d.queue.Retry(msg, delay, d.maxAttempts) {
		log.Error("pesan dibuang (dead-letter) setelah habis percobaan",
			"max_attempts", d.maxAttempts)
	}
}

// backoff — exponential + full jitter: rand(0, base×2^attempt), cap max.
func backoff(attempt int) time.Duration {
	ceil := baseBackoff << min(attempt, 10)
	if ceil > maxBackoff || ceil <= 0 {
		ceil = maxBackoff
	}
	jitter, err := rand.Int(rand.Reader, big.NewInt(int64(ceil)))
	if err != nil {
		return ceil // fallback deterministik (crypto/rand gagal sangat jarang)
	}
	return time.Duration(jitter.Int64())
}

// min — helper comparasi (tanpa import builtin min agar kompatibel).
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ValidateSenderRegistry — memastikan seluruh tipe channel kontrak punya
// sender (helper wiring main.go; panic lebih awal lebih baik daripada
// pesan gagal diam-diam).
func ValidateSenderRegistry(senders map[domain.ChannelType]domain.Sender) error {
	for _, t := range []domain.ChannelType{domain.ChannelSMTP, domain.ChannelTelegram, domain.ChannelWebhook} {
		if _, ok := senders[t]; !ok {
			return fmt.Errorf("sender %s tidak terdaftar", strings.ToUpper(string(t)))
		}
	}
	return nil
}
