// Package delivery — adapter eksekusi berulang (scheduler) yang memicu
// use case secara periodik. Bagian dari layer luar Clean Architecture;
// boleh bergantung pada usecase secara konkret.
package delivery

import (
	"context"
	"log/slog"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/usecase"
)

// Scheduler menjalankan siklus pengumpulan secara periodik sampai context
// dibatalkan (graceful shutdown dari platform.Runner).
type Scheduler struct {
	interval  time.Duration
	collector *usecase.Collector
	logger    *slog.Logger
}

// NewScheduler membangun scheduler dengan interval antar-siklus.
func NewScheduler(interval time.Duration, collector *usecase.Collector, logger *slog.Logger) *Scheduler {
	return &Scheduler{interval: interval, collector: collector, logger: logger}
}

// Start menjalankan loop ticker secara BLOCKING sampai ctx dibatalkan.
// Siklus pertama dieksekusi segera (tidak menunggu satu interval penuh).
// Jalankan dalam goroutine terpisah dari pemanggil.
func (s *Scheduler) Start(ctx context.Context) {
	s.runOnce(ctx)

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Debug("scheduler berhenti")
			return
		case <-ticker.C:
			s.runOnce(ctx)
		}
	}
}

// runOnce mengeksekusi satu siklus. Error sudah di-log di usecase.
func (s *Scheduler) runOnce(ctx context.Context) {
	_ = s.collector.RunOnce(ctx)
}
