// Package delivery — adapter eksekusi berulang (scheduler) yang memicu
// use case secara periodik. Bagian dari layer luar Clean Architecture;
// boleh bergantung pada usecase secara konkret.
package delivery

import (
	"context"
	"log/slog"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/usecase"
)

// Scheduler menjalankan probe kesehatan secara periodik sampai context
// dibatalkan (graceful shutdown dari platform.Runner).
type Scheduler struct {
	interval time.Duration
	checker  *usecase.HealthChecker
	logger   *slog.Logger
}

// NewScheduler membangun scheduler dengan interval antar-probe.
func NewScheduler(interval time.Duration, checker *usecase.HealthChecker, logger *slog.Logger) *Scheduler {
	return &Scheduler{interval: interval, checker: checker, logger: logger}
}

// Start menjalankan loop ticker secara BLOCKING sampai ctx dibatalkan.
// Probe pertama dieksekusi segera (tidak menunggu satu interval penuh).
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

// runOnce mengeksekusi satu siklus probe. Error dan pencatatan sudah
// ditangani usecase (sudah di-log di sana); scheduler hanya memicu.
func (s *Scheduler) runOnce(ctx context.Context) {
	_, _ = s.checker.RunOnce(ctx)
}
