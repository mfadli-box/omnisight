// Adapter SystemCollector/DockerStatsCollector — pemilih implementasi
// per-OS (build tag di collector_linux.go / collector_windows.go).
package platform

import (
	"context"
	"log/slog"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
)

// SystemCollector — ulasan port domain.SystemCollector di layer platform.
type SystemCollector interface {
	CollectInventory(ctx context.Context) (domain.Inventory, error)
	CollectHostSample(ctx context.Context) (domain.HostSample, error)
}

// DockerStatsCollector — ulasan port domain.DockerStatsCollector.
type DockerStatsCollector interface {
	CollectContainers(ctx context.Context) ([]domain.ContainerSample, error)
}

// NewSystemCollector memilih pengumpul metrik OS sesuai platform.
func NewSystemCollector(logger *slog.Logger) SystemCollector {
	return newSystemCollector(logger)
}
