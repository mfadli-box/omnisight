//go:build linux

// Collector metrik host Linux — membaca /proc (cpu, mem, load, net, uptime)
// dan statfs untuk disk. Murni stdlib + golang.org/x/sys/unix.
package platform

import (
	"bufio"
	"bytes"
	"context"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
	"golang.org/x/sys/unix"
)

// HostCollector implementasi port domain.SystemCollector untuk Linux.
type HostCollector struct {
	logger *slog.Logger

	mu        sync.Mutex
	prevCPU   cpuTimes  // /proc/stat snapshot sebelumnya (untuk usage %)
	prevNet   netCounts // /proc/net/dev snapshot sebelumnya (untuk Bps)
	prevNetAt time.Time // waktu snapshot net sebelumnya
	hasCPU    bool
	hasNet    bool
}

// newSystemCollector dipanggil NewSystemCollector (collector.go).
func newSystemCollector(logger *slog.Logger) *HostCollector {
	return &HostCollector{logger: logger}
}

// cpuTimes — agregasi counter CPU (/proc/stat, jiffies).
type cpuTimes struct {
	idle  uint64 // idle + iowait
	total uint64 // semua state
}

// netCounts — total rx/tx bytes semua interface (kecuali lo).
type netCounts struct {
	rx uint64
	tx uint64
}

// CollectInventory mengumpulkan inventaris hardware/software.
func (c *HostCollector) CollectInventory(ctx context.Context) (domain.Inventory, error) {
	inv := domain.Inventory{Hostname: hostnameSafe()}

	if raw, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		inv.CPUModel = parseCPUModel(raw)
		inv.CPUCores = countCPUCores(raw)
	} else {
		c.logger.Warn("gagal baca /proc/cpuinfo", "err", err.Error())
	}

	if raw, err := os.ReadFile("/proc/meminfo"); err == nil {
		if v, ok := parseMemInfoMemTotal(raw); ok {
			inv.MemoryTotalBytes = v
		}
	} else {
		c.logger.Warn("gagal baca /proc/meminfo", "err", err.Error())
	}

	if st, err := statfsRoot(); err == nil {
		inv.StorageTotalBytes = st.total
	} else {
		c.logger.Warn("gagal statfs /", "err", err.Error())
	}

	name, ver := parseOSRelease()
	inv.OSName = name
	inv.OSVersion = ver

	inv.Payload = map[string]any{
		"kind":         "host_inventory",
		"platform":     "linux",
		"collected_at": time.Now().UTC().Format(time.RFC3339),
	}
	return inv, nil
}

// CollectHostSample mengambil satu sampel metrik; usage/Bps dihitung delta
// terhadap sampel sebelumnya (sampel pertama: field delta = null).
func (c *HostCollector) CollectHostSample(ctx context.Context) (domain.HostSample, error) {
	now := time.Now()
	sample := domain.HostSample{RecordedAt: now.UTC()}

	if raw, err := os.ReadFile("/proc/loadavg"); err == nil {
		if l1, l5, l15, ok := parseLoadavg(raw); ok {
			sample.Load1, sample.Load5, sample.Load15 = ptr(l1), ptr(l5), ptr(l15)
		}
	}
	if raw, err := os.ReadFile("/proc/meminfo"); err == nil {
		if total, ok := parseMemInfoMemTotal(raw); ok {
			sample.MemTotalBytes = &total
			if avail, ok := parseMemInfoMemAvailable(raw); ok {
				used := total - avail
				sample.MemUsedBytes = &used
			}
		}
	}
	if st, err := statfsRoot(); err == nil {
		sample.DiskTotalBytes = &st.total
		sample.DiskUsedBytes = &st.used
	}
	if raw, err := os.ReadFile("/proc/uptime"); err == nil {
		if up, ok := parseUptime(raw); ok {
			sample.UptimeSeconds = &up
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if raw, err := os.ReadFile("/proc/stat"); err == nil {
		if cur, ok := parseCPUStat(raw); ok {
			if c.hasCPU && cur.total > c.prevCPU.total {
				idleDelta := float64(cur.idle - c.prevCPU.idle)
				totalDelta := float64(cur.total - c.prevCPU.total)
				if totalDelta > 0 {
					usage := (1 - idleDelta/totalDelta) * 100
					sample.CPUUsagePct = ptr(usage)
				}
			}
			c.prevCPU, c.hasCPU = cur, true
		}
	} else {
		c.logger.Warn("gagal baca /proc/stat", "err", err.Error())
	}

	if raw, err := os.ReadFile("/proc/net/dev"); err == nil {
		if cur, ok := parseNetDev(raw); ok {
			if c.hasNet {
				elapsed := now.Sub(c.prevNetAt).Seconds()
				if elapsed > 0 {
					in := int64(float64(cur.rx-c.prevNet.rx) / elapsed)
					out := int64(float64(cur.tx-c.prevNet.tx) / elapsed)
					if in < 0 {
						in = 0 // counter reset (reboot) → clamp
					}
					if out < 0 {
						out = 0
					}
					sample.NetInBPS, sample.NetOutBPS = &in, &out
				}
			}
			c.prevNet, c.prevNetAt, c.hasNet = cur, now, true
		}
	} else {
		c.logger.Warn("gagal baca /proc/net/dev", "err", err.Error())
	}

	return sample, nil
}

// diskSizes hasil statfs root.
type diskSizes struct {
	total int64
	used  int64
}

// statfsRoot menghitung kapasitas filesystem root via unix.Statfs.
func statfsRoot() (diskSizes, error) {
	var st unix.Statfs_t
	if err := unix.Statfs("/", &st); err != nil {
		return diskSizes{}, err
	}
	bsize := int64(st.Bsize)
	total := int64(st.Blocks) * bsize
	free := int64(st.Bfree) * bsize
	return diskSizes{total: total, used: max64(0, total-free)}, nil
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// --- parser /proc (beroperasi pada []byte agar mudah di-unit-test) --------

// parseCPUModel mengekstrak "model name" pertama dari /proc/cpuinfo.
func parseCPUModel(raw []byte) string {
	for _, line := range strings.Split(string(raw), "\n") {
		if key, val, ok := splitProcKV(line); ok && key == "model name" {
			return strings.TrimSpace(val)
		}
	}
	return ""
}

// countCPUCores menghitung jumlah entri "processor" (logical cores).
func countCPUCores(raw []byte) int {
	n := 0
	for _, line := range strings.Split(string(raw), "\n") {
		if key, _, ok := splitProcKV(line); ok && key == "processor" {
			n++
		}
	}
	return n
}

// splitProcKV memecah "key\t: value" format /proc.
func splitProcKV(line string) (string, string, bool) {
	idx := strings.Index(line, ":")
	if idx < 0 {
		return "", "", false
	}
	return strings.TrimSpace(line[:idx]), strings.TrimSpace(line[idx+1:]), true
}

// parseOSRelease membaca /etc/os-release (NAME, VERSION).
func parseOSRelease() (string, string) {
	raw, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return "", ""
	}
	name, version := "", ""
	for _, line := range strings.Split(string(raw), "\n") {
		idx := strings.Index(line, "=")
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.Trim(strings.TrimSpace(line[idx+1:]), `"`)
		switch key {
		case "NAME":
			name = val
		case "VERSION":
			version = val
		}
	}
	return name, version
}

// parseMemInfoMemTotal — MemTotal (kB → bytes).
func parseMemInfoMemTotal(raw []byte) (int64, bool) {
	return scanMemInfoKB(raw, "MemTotal")
}

// parseMemInfoMemAvailable — MemAvailable (kB → bytes).
func parseMemInfoMemAvailable(raw []byte) (int64, bool) {
	return scanMemInfoKB(raw, "MemAvailable")
}

func scanMemInfoKB(raw []byte, field string) (int64, bool) {
	sc := bufio.NewScanner(bytes.NewReader(raw))
	for sc.Scan() {
		key, val, ok := splitProcKV(sc.Text())
		if !ok || key != field {
			continue
		}
		kb, err := strconv.ParseInt(strings.Fields(val)[0], 10, 64)
		if err != nil {
			return 0, false
		}
		return kb * 1024, true
	}
	return 0, false
}

// parseLoadavg — tiga load average.
func parseLoadavg(raw []byte) (float64, float64, float64, bool) {
	fields := strings.Fields(string(raw))
	if len(fields) < 3 {
		return 0, 0, 0, false
	}
	l1, err1 := strconv.ParseFloat(fields[0], 64)
	l5, err5 := strconv.ParseFloat(fields[1], 64)
	l15, err15 := strconv.ParseFloat(fields[2], 64)
	if err1 != nil || err5 != nil || err15 != nil {
		return 0, 0, 0, false
	}
	return l1, l5, l15, true
}

// parseUptime — detik uptime (field pertama /proc/uptime).
func parseUptime(raw []byte) (int64, bool) {
	fields := strings.Fields(string(raw))
	if len(fields) == 0 {
		return 0, false
	}
	f, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, false
	}
	return int64(f), true
}

// parseCPUStat — agregasi baris "cpu " pada /proc/stat.
func parseCPUStat(raw []byte) (cpuTimes, bool) {
	for _, line := range strings.Split(string(raw), "\n") {
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			return cpuTimes{}, false
		}
		var total, idle uint64
		for i, f := range fields[1:] {
			v, err := strconv.ParseUint(f, 10, 64)
			if err != nil {
				return cpuTimes{}, false
			}
			total += v
			// idx 3 = idle, idx 4 = iowait (dihitung sebagai idle).
			if i == 3 || i == 4 {
				idle += v
			}
		}
		return cpuTimes{idle: idle, total: total}, true
	}
	return cpuTimes{}, false
}

// parseNetDev — jumlah rx/tx bytes semua interface kecuali lo.
func parseNetDev(raw []byte) (netCounts, bool) {
	var counts netCounts
	found := false
	for _, line := range strings.Split(string(raw), "\n") {
		idx := strings.Index(line, ":")
		if idx < 0 {
			continue
		}
		iface := strings.TrimSpace(line[:idx])
		if iface == "" || iface == "lo" {
			continue
		}
		fields := strings.Fields(line[idx+1:])
		if len(fields) < 10 {
			continue
		}
		rx, err1 := strconv.ParseUint(fields[0], 10, 64)
		tx, err2 := strconv.ParseUint(fields[8], 10, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		counts.rx += rx
		counts.tx += tx
		found = true
	}
	return counts, found
}

// hostnameSafe — hostname atau string kosong (tidak pernah gagal).
func hostnameSafe() string {
	h, err := os.Hostname()
	if err != nil {
		return ""
	}
	return h
}

func ptr(v float64) *float64 { return &v }
