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
	usage, err := s.cpuUsage(ctx)
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
	return domain.Telemetry{
		CollectedAt: time.Now().UTC(), Hostname: host, OS: runtime.GOOS, OSVersion: osVersion,
		Architecture: runtime.GOARCH, CPUPercent: usage, CPUCount: runtime.NumCPU(),
		MemoryTotal: memTotal, MemoryUsed: memUsed, DiskTotal: diskTotal, DiskUsed: diskUsed,
		UptimeSeconds: uptime,
	}, nil
}

func (s *Sampler) cpuUsage(ctx context.Context) (float64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idle, total, err := cpuTimes()
	if err != nil {
		return 0, err
	}
	if !s.hasPrevious {
		timer := time.NewTimer(100 * time.Millisecond)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case <-timer.C:
		}
		s.previous = cpuReading{idle: idle, total: total}
		idle, total, err = cpuTimes()
		if err != nil {
			return 0, err
		}
	}
	previous := s.previous
	s.previous, s.hasPrevious = cpuReading{idle: idle, total: total}, true
	if total <= previous.total || idle < previous.idle {
		return 0, nil
	}
	deltaTotal, deltaIdle := total-previous.total, idle-previous.idle
	if deltaIdle > deltaTotal {
		return 0, nil
	}
	return 100 * float64(deltaTotal-deltaIdle) / float64(deltaTotal), nil
}
