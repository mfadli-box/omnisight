// Package usecase — orkestrasi otomasi; HANYA bergantung pada internal/domain
// (interface), tidak pernah pada adapter infrastructure secara konkret.
package usecase

import (
	"context"
	"log/slog"

	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/domain"
)

// HealthChecker use case probe kesehatan osc_rest.
type HealthChecker struct {
	probe  domain.RustAPIProbe
	logger *slog.Logger
}

func NewHealthChecker(probe domain.RustAPIProbe, logger *slog.Logger) *HealthChecker {
	return &HealthChecker{probe: probe, logger: logger}
}

// RunOnce menjalankan satu siklus probe. Tidak pernah panic; kegagalan
// dilaporkan sebagai error domain dan hasil dicatat via log terstruktur.
func (h *HealthChecker) RunOnce(ctx context.Context) (domain.ServiceHealth, error) {
	health, err := h.probe.ProbeHealth(ctx)
	if err != nil {
		// Detail transport hanya di-log oleh adapter; di sini generik.
		h.logger.Warn("probe osc_rest gagal", "status", "unreachable")
		return domain.ServiceHealth{
			Service:   "osc_rest",
			Status:    "down",
			Reachable: false,
		}, err
	}

	h.logger.Info("probe osc_rest",
		"service", health.Service,
		"status", health.Status,
		"reachable", health.Reachable,
	)
	return health, nil
}
