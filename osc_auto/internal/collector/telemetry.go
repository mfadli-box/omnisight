package collector

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"omnisight/osc_auto/internal/domain"
)

const maxDevices = 64

type Collector struct {
	Sampler domain.Sampler
}

func (c Collector) Collect(ctx context.Context) (domain.HostMetrics, error) {
	sample, err := c.Sampler.Sample(ctx)
	if err != nil {
		return domain.HostMetrics{}, err
	}
	const mib = 1024 * 1024
	metrics := domain.HostMetrics{
		CPUPct: sample.CPUPercent, RAMUsedMB: float64(sample.MemoryUsed) / mib, RAMTotalMB: float64(sample.MemoryTotal) / mib,
		Disks:  []domain.DiskUsage{{Mount: systemMount(), UsedBytes: sample.DiskUsed, TotalBytes: sample.DiskTotal}},
		DiskIO: []domain.DiskIO{}, Network: []domain.NetworkIO{},
		Smart: []domain.SmartHealth{}, Containers: []domain.ContainerStat{},
	}
	smart := make(chan []domain.SmartHealth, 1)
	containers := make(chan []domain.ContainerStat, 1)
	go func() { smart <- smartHealth(ctx) }()
	go func() { containers <- containerStats(ctx) }()
	collectPlatform(ctx, &metrics)
	metrics.Smart = <-smart
	metrics.Containers = <-containers
	return metrics, ctx.Err()
}

// The tools are local executables with fixed commands and a bounded output buffer.
type commandOutput struct{ bytes.Buffer }

func (out *commandOutput) Write(p []byte) (int, error) {
	if len(p) > (128<<10)-out.Len() {
		return 0, errors.New("collector output exceeded limit")
	}
	return out.Buffer.Write(p)
}

func run(cmd *exec.Cmd) ([]byte, error) {
	cmd.WaitDelay = time.Second
	var out commandOutput
	cmd.Stdout = &out
	err := cmd.Run()
	return out.Bytes(), err
}

var deviceName = regexp.MustCompile(`^/dev/[A-Za-z0-9_./-]{1,120}$`)
var deviceType = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_,+.-]{0,63}$`)

func smartHealth(ctx context.Context) []domain.SmartHealth {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	results := []domain.SmartHealth{}
	data, err := run(exec.CommandContext(ctx, "smartctl", "--scan", "--json"))
	if err != nil {
		return results
	}
	var scan struct {
		Devices []struct{ Name, Type string }
	}
	if json.Unmarshal(data, &scan) != nil {
		return results
	}
	for _, device := range scan.Devices[:min(len(scan.Devices), maxDevices)] {
		if ctx.Err() != nil {
			break
		}
		if !deviceName.MatchString(device.Name) || strings.Contains(device.Name, "..") || !deviceType.MatchString(device.Type) {
			continue
		}
		probe, stop := context.WithTimeout(ctx, 2*time.Second)
		// smartctl returns nonzero status bits for disk failures as well as probe errors.
		data, _ := run(exec.CommandContext(probe, "smartctl", "--json", "--info", "--health", "-d", device.Type, device.Name))
		stop()
		var health struct {
			Model string                 `json:"model_name"`
			Smart struct{ Passed *bool } `json:"smart_status"`
		}
		_ = json.Unmarshal(data, &health)
		results = append(results, domain.SmartHealth{Device: device.Name + " (" + device.Type + ")", Model: health.Model, Passed: health.Smart.Passed})
	}
	return results
}

func containerStats(ctx context.Context) []domain.ContainerStat {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	results := []domain.ContainerStat{}
	cmd := exec.CommandContext(ctx, "docker", "--host", dockerHost, "stats", "--no-stream", "--no-trunc", "--format", "{{json .}}")
	cmd.Env = make([]string, 0, len(os.Environ()))
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(entry), "DOCKER_") {
			cmd.Env = append(cmd.Env, entry)
		}
	}
	data, err := run(cmd)
	if err != nil {
		return results
	}
	for _, line := range bytes.Split(data, []byte("\n")) {
		var stat struct{ ID, Name, CPUPerc, MemUsage, NetIO, BlockIO string }
		if json.Unmarshal(line, &stat) != nil || stat.ID == "" {
			continue
		}
		cpu, err := strconv.ParseFloat(strings.TrimSuffix(stat.CPUPerc, "%"), 64)
		if err != nil || math.IsNaN(cpu) || math.IsInf(cpu, 0) || cpu < 0 {
			continue
		}
		results = append(results, domain.ContainerStat{
			ID: stat.ID, Name: stat.Name, CPUPct: cpu, Memory: stat.MemUsage, Network: stat.NetIO, BlockIO: stat.BlockIO,
		})
		if len(results) == maxDevices {
			break
		}
	}
	return results
}
