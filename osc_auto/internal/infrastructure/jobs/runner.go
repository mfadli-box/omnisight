package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"omnisight/osc_auto/internal/domain"
)

type Runner struct{ sampler domain.Sampler }

func New(sampler domain.Sampler) *Runner { return &Runner{sampler: sampler} }
func (r *Runner) Run(ctx context.Context, command string, args map[string]string) (string, error) {
	switch command {
	case "system.health":
		sample, err := r.sampler.Sample(ctx)
		if err != nil {
			return "", err
		}
		summary := struct {
			OS          string    `json:"os"`
			Version     string    `json:"version"`
			CPUPercent  float64   `json:"cpu_percent"`
			MemoryUsed  uint64    `json:"memory_used_bytes"`
			MemoryTotal uint64    `json:"memory_total_bytes"`
			DiskUsed    uint64    `json:"disk_used_bytes"`
			DiskTotal   uint64    `json:"disk_total_bytes"`
			Uptime      uint64    `json:"uptime_seconds"`
			CollectedAt time.Time `json:"collected_at"`
		}{sample.OS, sample.OSVersion, sample.CPUPercent, sample.MemoryUsed, sample.MemoryTotal, sample.DiskUsed, sample.DiskTotal, sample.UptimeSeconds, sample.CollectedAt}
		data, err := json.Marshal(summary)
		return string(data), err
	case "service.status":
		return serviceStatus(ctx, args["service"])
	default:
		return "", errors.New("unsupported healthcheck command")
	}
}
func bounded(s string) string {
	s = strings.ToValidUTF8(s, "�")
	if len(s) > domain.MaxOutputByte {
		return s[:domain.MaxOutputByte]
	}
	return s
}
