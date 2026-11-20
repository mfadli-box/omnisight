package jobs

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os/exec"
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
	case "uptime", "df", "docker ps", "systemctl status":
		return r.diagnostic(ctx, command, args["service"])
	case "service.status":
		return serviceStatus(ctx, args["service"])
	default:
		return "", errors.New("unsupported healthcheck command")
	}
}
func bounded(s string) string {
	if len(s) > domain.MaxOutputByte {
		s = s[:domain.MaxOutputByte]
	}
	return strings.ToValidUTF8(s, "")
}

type commandOutput struct{ buffer bytes.Buffer }

func (b *commandOutput) Write(p []byte) (int, error) {
	remaining := domain.MaxOutputByte - b.buffer.Len()
	_, _ = b.buffer.Write(p[:min(len(p), remaining)])
	return len(p), nil
}

func runCommand(ctx context.Context, env []string, path string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = env
	cmd.WaitDelay = time.Second
	output := &commandOutput{}
	cmd.Stdout, cmd.Stderr = output, output
	err := cmd.Run()
	return bounded(strings.TrimSpace(output.buffer.String())), err
}
