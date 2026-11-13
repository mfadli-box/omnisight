//go:build windows

// Collector metrik host Windows — memakai API Win32 via golang.org/x/sys
// (GlobalMemoryStatusEx, GetSystemTimes, GetTickCount64, GetDiskFreeSpaceEx,
// registry). Metrik net/load tidak tersedia tanpa driver tambahan → null
// (kontrak memungkinkan null).
package platform

import (
	"context"
	"log/slog"
	"os"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// Bindings Win32 yang tidak diekspor golang.org/x/windows — dideklarasikan
// lokal (LazySystemDLL = fail-safe, tanpa CGO, aman lintas-arsitektur).
var (
	modKernel32              = windows.NewLazySystemDLL("kernel32.dll")
	procGlobalMemoryStatusEx = modKernel32.NewProc("GlobalMemoryStatusEx")
	procGetSystemTimes       = modKernel32.NewProc("GetSystemTimes")
	procGetTickCount64       = modKernel32.NewProc("GetTickCount64")
)

// memoryStatusEx — struct MEMORYSTATUSEX Win32 (layout harus persis).
type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

// globalMemoryStatusEx wrapper kernel32.GlobalMemoryStatusEx.
func globalMemoryStatusEx(m *memoryStatusEx) error {
	m.Length = uint32(unsafe.Sizeof(*m))
	r1, _, err := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(m)))
	if r1 == 0 {
		return err
	}
	return nil
}

// getSystemTimes wrapper kernel32.GetSystemTimes (Filetime 100-ns).
func getSystemTimes(idle, kernel, user *syscall.Filetime) error {
	r1, _, err := procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(idle)),
		uintptr(unsafe.Pointer(kernel)),
		uintptr(unsafe.Pointer(user)),
	)
	if r1 == 0 {
		return err
	}
	return nil
}

// getTickCount64 wrapper kernel32.GetTickCount64 (ms sejak boot).
func getTickCount64() uint64 {
	r1, _, _ := procGetTickCount64.Call()
	return uint64(r1)
}

// HostCollectorWin implementasi port domain.SystemCollector untuk Windows.
type HostCollectorWin struct {
	logger *slog.Logger

	mu      sync.Mutex
	prevCPU cpuTimesWin // GetSystemTimes snapshot sebelumnya
	hasPrev bool
}

// newSystemCollector dipanggil NewSystemCollector (collector.go).
func newSystemCollector(logger *slog.Logger) *HostCollectorWin {
	return &HostCollectorWin{logger: logger}
}

// cpuTimesWin — Filetime 100-ns unit (idle, kernel, user).
type cpuTimesWin struct {
	idle   uint64
	kernel uint64
	user   uint64
}

// filetimeToUint64 konversi syscall.Filetime → 100-ns sejak epoch.
func filetimeToUint64(f syscall.Filetime) uint64 {
	return uint64(f.HighDateTime)<<32 | uint64(f.LowDateTime)
}

// CollectInventory — inventaris via registry + API Win32.
func (c *HostCollectorWin) CollectInventory(ctx context.Context) (domain.Inventory, error) {
	inv := domain.Inventory{
		CPUCores: runtime.NumCPU(),
		Hostname: hostnameSafe(),
	}

	// CPU model dari registry (HARDWARE\DESCRIPTION\System\CentralProcessor\0).
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE,
		`HARDWARE\DESCRIPTION\System\CentralProcessor\0`, registry.QUERY_VALUE); err == nil {
		if val, _, err := k.GetStringValue("ProcessorNameString"); err == nil {
			inv.CPUModel = strings.TrimSpace(val)
		}
		_ = k.Close()
	} else {
		c.logger.Warn("registry CentralProcessor tidak terbaca", "err", err.Error())
	}

	// Memori total via GlobalMemoryStatusEx.
	var mst memoryStatusEx
	if err := globalMemoryStatusEx(&mst); err == nil {
		inv.MemoryTotalBytes = int64(mst.TotalPhys)
	} else {
		c.logger.Warn("GlobalMemoryStatusEx gagal", "err", err.Error())
	}

	// Storage total drive sistem (C:\).
	var free, total, avail uint64
	if err := windows.GetDiskFreeSpaceEx(
		windows.StringToUTF16Ptr(`C:\`), &free, &total, &avail); err == nil {
		inv.StorageTotalBytes = int64(total)
	} else {
		c.logger.Warn("GetDiskFreeSpaceEx gagal", "err", err.Error())
	}

	// OS name/version dari registry CurrentVersion.
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE,
		`SOFTWARE\Microsoft\Windows NT\CurrentVersion`, registry.QUERY_VALUE); err == nil {
		if val, _, err := k.GetStringValue("ProductName"); err == nil {
			inv.OSName = val
		}
		if val, _, err := k.GetStringValue("DisplayVersion"); err == nil {
			inv.OSVersion = val
		}
		_ = k.Close()
	}

	inv.Payload = map[string]any{
		"kind":         "host_inventory",
		"platform":     "windows",
		"collected_at": time.Now().UTC().Format(time.RFC3339),
	}
	return inv, nil
}

// CollectHostSample — sampel metrik (CPU delta, mem, disk, uptime).
func (c *HostCollectorWin) CollectHostSample(ctx context.Context) (domain.HostSample, error) {
	now := time.Now()
	sample := domain.HostSample{RecordedAt: now.UTC()}

	// Memori via GlobalMemoryStatusEx.
	var mst memoryStatusEx
	if err := globalMemoryStatusEx(&mst); err == nil {
		total := int64(mst.TotalPhys)
		used := int64(mst.TotalPhys - mst.AvailPhys)
		sample.MemTotalBytes = &total
		sample.MemUsedBytes = &used
	} else {
		c.logger.Warn("GlobalMemoryStatusEx gagal", "err", err.Error())
	}

	// Disk drive sistem.
	var free, total, avail uint64
	if err := windows.GetDiskFreeSpaceEx(
		windows.StringToUTF16Ptr(`C:\`), &free, &total, &avail); err == nil {
		t := int64(total)
		u := int64(total - free)
		sample.DiskTotalBytes = &t
		sample.DiskUsedBytes = &u
	} else {
		c.logger.Warn("GetDiskFreeSpaceEx gagal", "err", err.Error())
	}

	// Uptime GetTickCount64 (ms).
	up := int64(getTickCount64() / 1000)
	sample.UptimeSeconds = &up

	// CPU usage via GetSystemTimes delta.
	var idleFT, kernelFT, userFT syscall.Filetime
	if err := getSystemTimes(&idleFT, &kernelFT, &userFT); err == nil {
		cur := cpuTimesWin{
			idle:   filetimeToUint64(idleFT),
			kernel: filetimeToUint64(kernelFT),
			user:   filetimeToUint64(userFT),
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.hasPrev {
			idleDelta := float64(cur.idle - c.prevCPU.idle)
			// kernel+user termasuk idle (kernel time mencakup idle),
			// total bekerja = kernel+user−idle.
			totalDelta := float64(cur.kernel + cur.user - cur.idle - c.prevCPU.kernel - c.prevCPU.user + c.prevCPU.idle)
			if totalDelta > 0 {
				usage := (totalDelta / (idleDelta + totalDelta)) * 100
				if usage > 100 {
					usage = 100
				}
				if usage < 0 {
					usage = 0
				}
				sample.CPUUsagePct = ptr(usage)
			}
		}
		c.prevCPU, c.hasPrev = cur, true
	} else {
		c.logger.Warn("GetSystemTimes gagal", "err", err.Error())
	}

	// Net In/Out & load average: null (kontrak memungkinkan null).
	return sample, nil
}

// hostnameSafe — hostname atau string kosong.
func hostnameSafe() string {
	h, err := os.Hostname()
	if err != nil {
		return ""
	}
	return h
}

func ptr(v float64) *float64 { return &v }
