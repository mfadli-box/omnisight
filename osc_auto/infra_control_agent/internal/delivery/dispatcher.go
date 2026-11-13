// Package delivery — adapter eksekusi berulang (dispatcher loop) yang
// memicu use case secara periodik. Bagian dari layer luar Clean
// Architecture; boleh bergantung pada usecase secara konkret.
package delivery

import (
	"context"
	"log/slog"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/usecase"
)

// Dispatcher menjalankan siklus tarik-eksekusi-ack secara periodik sampai
// context dibatalkan (graceful shutdown dari platform.Runner).
type Dispatcher struct {
	interval   time.Duration
	controller *usecase.Dispatcher
	logger     *slog.Logger
}

// NewDispatcher membangun loop dengan interval antar-poll.
func NewDispatcher(interval time.Duration, controller *usecase.Dispatcher, logger *slog.Logger) *Dispatcher {
	return &Dispatcher{interval: interval, controller: controller, logger: logger}
}

// Start menjalankan loop ticker secara BLOCKING sampai ctx dibatalkan.
// Siklus pertama dieksekusi segera (tidak menunggu satu interval penuh).
// Jalankan dalam goroutine terpisah dari pemanggil.
func (d *Dispatcher) Start(ctx context.Context) {
	d.runOnce(ctx)

	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			d.logger.Debug("dispatcher loop berhenti")
			return
		case <-ticker.C:
			d.runOnce(ctx)
		}
	}
}

// runOnce mengeksekusi satu siklus. Error sudah di-log di usecase.
func (d *Dispatcher) runOnce(ctx context.Context) {
	_ = d.controller.RunOnce(ctx)
}
