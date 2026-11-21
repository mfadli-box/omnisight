package collector

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"omnisight/osc_auto/internal/domain"
)

const dockerHost = "unix:///var/run/docker.sock"

func systemMount() string { return "/" }

func collectPlatform(_ context.Context, metrics *domain.HostMetrics) {
	if data, err := os.ReadFile("/proc/loadavg"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 3 {
			var load [3]float64
			valid := true
			for i := range load {
				load[i], err = strconv.ParseFloat(fields[i], 64)
				valid = valid && err == nil
			}
			if valid {
				metrics.LoadAverage = &load
			}
		}
	}
	zones, _ := filepath.Glob("/sys/class/thermal/thermal_zone*/temp")
	for _, path := range zones {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		value, err := strconv.ParseFloat(strings.TrimSpace(string(data)), 64)
		value /= 1000
		if err == nil && value >= -273.15 && value <= 250 && (metrics.Temperature == nil || value > *metrics.Temperature) {
			metrics.Temperature = &value
		}
	}
	collectLinuxCounters(metrics)
	collectLinuxMounts(metrics)
}

func collectLinuxCounters(metrics *domain.HostMetrics) {
	if data, err := os.ReadFile("/proc/diskstats"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 10 {
				continue
			}
			// Scan hardware counters once, without counting partitions and stacked volumes.
			if _, err := os.Stat(filepath.Join("/sys/block", fields[2], "device")); err != nil {
				continue
			}
			read, rerr := strconv.ParseUint(fields[5], 10, 64)
			write, werr := strconv.ParseUint(fields[9], 10, 64)
			if rerr == nil && werr == nil {
				metrics.DiskIO = append(metrics.DiskIO, domain.DiskIO{Device: fields[2], ReadBytes: 512 * read, WriteBytes: 512 * write})
				if len(metrics.DiskIO) == maxDevices {
					break
				}
			}
		}
	}
	if data, err := os.ReadFile("/proc/net/dev"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			name, counters, found := strings.Cut(line, ":")
			fields := strings.Fields(counters)
			if !found || len(fields) < 9 || strings.TrimSpace(name) == "lo" {
				continue
			}
			rx, rerr := strconv.ParseUint(fields[0], 10, 64)
			tx, terr := strconv.ParseUint(fields[8], 10, 64)
			if rerr == nil && terr == nil {
				metrics.Network = append(metrics.Network, domain.NetworkIO{Interface: strings.TrimSpace(name), RXBytes: rx, TXBytes: tx})
				if len(metrics.Network) == maxDevices {
					break
				}
			}
		}
	}
}

func collectLinuxMounts(metrics *domain.HostMetrics) {
	data, err := os.ReadFile("/proc/self/mountinfo")
	if err != nil {
		return
	}
	unescape := strings.NewReplacer(`\040`, " ", `\011`, "\t", `\012`, "\n", `\134`, `\`)
	seen := map[string]bool{"/": true}
	for _, line := range strings.Split(string(data), "\n") {
		before, after, _ := strings.Cut(line, " - ")
		mount, filesystem := strings.Fields(before), strings.Fields(after)
		if len(mount) < 6 || len(filesystem) < 2 || !strings.HasPrefix(filesystem[1], "/dev/") {
			continue
		}
		path := unescape.Replace(mount[4])
		if seen[path] || len(path) > 1024 {
			continue
		}
		var stat syscall.Statfs_t
		if syscall.Statfs(path, &stat) == nil && stat.Blocks > 0 && stat.Bavail <= stat.Blocks {
			size := uint64(stat.Bsize)
			metrics.Disks = append(metrics.Disks, domain.DiskUsage{Mount: path, UsedBytes: (stat.Blocks - stat.Bavail) * size, TotalBytes: stat.Blocks * size})
			seen[path] = true
			if len(metrics.Disks) == maxDevices {
				return
			}
		}
	}
}
