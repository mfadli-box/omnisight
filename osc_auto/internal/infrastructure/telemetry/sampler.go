package telemetry

import (
	"context"
	"runtime"
	"sync"
	"time"

	"omnisight/osc_auto/internal/domain"
)

type cpuReading struct{ idle, total uint64 }

type Sampler struct {
	mu          sync.Mutex
	previous    cpuReading
	hasPrevious bool
}

func NewSampler() *Sampler { return &Sampler{} }

func (s *Sampler) Sample(ctx context.Context) (domain.Telemetry, error) {
	if err := ctx.Err(); err != nil {
		return domain.Telemetry{}, err
	}
	host, err := hostname()
	if err != nil {
		return domain.Telemetry{}, err
	}
	osVersion, err := operatingSystemVersion()
	if err != nil {
		return domain.Telemetry{}, err
	}
	idle, total, err := cpuTimes()
	if err != nil {
		return domain.Telemetry{}, err
	}
	memTotal, memUsed, err := memory()
	if err != nil {
		return domain.Telemetry{}, err
	}
	diskTotal, diskUsed, err := disk()
	if err != nil {
		return domain.Telemetry{}, err
	}
	uptime, err := uptime()
	if err != nil {
		return domain.Telemetry{}, err
	}
	s.mu.Lock()
	usage := 0.0
	if s.hasPrevious && total > s.previous.total && idle >= s.previous.idle {
		deltaTotal, deltaIdle := total-s.previous.total, idle-s.previous.idle
		if deltaTotal > 0 {
			usage = 100 * float64(deltaTotal-deltaIdle) / float64(deltaTotal)
		}
	}
	s.previous, s.hasPrevious = cpuReading{idle: idle, total: total}, true
	s.mu.Unlock()
	if usage < 0 {
		usage = 0
	}
	if usage > 100 {
		usage = 100
	}
	return domain.Telemetry{
		CollectedAt: time.Now().UTC(), Hostname: host, OS: runtime.GOOS, OSVersion: osVersion,
		Architecture: runtime.GOARCH, CPUPercent: usage, CPUCount: runtime.NumCPU(),
		MemoryTotal: memTotal, MemoryUsed: memUsed, DiskTotal: diskTotal, DiskUsed: diskUsed,
		UptimeSeconds: uptime,
	}, nil
}
