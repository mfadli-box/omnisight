//go:build windows

package telemetry

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func hostname() (string, error) { return os.Hostname() }

func operatingSystemVersion() (string, error) {
	version := windows.RtlGetVersion()
	if version == nil {
		return "Windows", nil
	}
	return fmt.Sprintf("Windows %d.%d build %d", version.MajorVersion, version.MinorVersion, version.BuildNumber), nil
}

func cpuTimes() (uint64, uint64, error) {
	proc := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetSystemTimes")
	var idle, kernel, user windows.Filetime
	result, _, callErr := proc.Call(uintptr(unsafe.Pointer(&idle)), uintptr(unsafe.Pointer(&kernel)), uintptr(unsafe.Pointer(&user)))
	runtime.KeepAlive(&idle)
	runtime.KeepAlive(&kernel)
	runtime.KeepAlive(&user)
	if result == 0 {
		if callErr != syscall.Errno(0) {
			return 0, 0, callErr
		}
		return 0, 0, errors.New("Windows CPU counters unavailable")
	}
	idleTicks := filetimeTicks(idle)
	kernelTicks := filetimeTicks(kernel)
	userTicks := filetimeTicks(user)
	return idleTicks, kernelTicks + userTicks, nil
}

type memoryStatusEx struct {
	length                   uint32
	memoryLoad               uint32
	totalPhys                uint64
	availablePhys            uint64
	totalPageFile            uint64
	availablePageFile        uint64
	totalVirtual             uint64
	availableVirtual         uint64
	availableExtendedVirtual uint64
}

func memory() (uint64, uint64, error) {
	status := memoryStatusEx{length: uint32(unsafe.Sizeof(memoryStatusEx{}))}
	proc := windows.NewLazySystemDLL("kernel32.dll").NewProc("GlobalMemoryStatusEx")
	result, _, callErr := proc.Call(uintptr(unsafe.Pointer(&status)))
	runtime.KeepAlive(&status)
	if result == 0 {
		if callErr != syscall.Errno(0) {
			return 0, 0, callErr
		}
		return 0, 0, errors.New("Windows memory counters unavailable")
	}
	if status.availablePhys > status.totalPhys {
		return 0, 0, errors.New("Windows memory counters invalid")
	}
	return status.totalPhys, status.totalPhys - status.availablePhys, nil
}

func disk() (uint64, uint64, error) {
	root := os.Getenv("SystemDrive")
	if root == "" {
		root = "C:"
	}
	root = filepath.Clean(root + "\\")
	path, err := windows.UTF16PtrFromString(root)
	if err != nil {
		return 0, 0, err
	}
	var available, total uint64
	if err := windows.GetDiskFreeSpaceEx(path, &available, &total, nil); err != nil {
		return 0, 0, err
	}
	if available > total {
		return 0, 0, errors.New("Windows disk counters invalid")
	}
	return total, total - available, nil
}

func uptime() (uint64, error) { return uint64(windows.DurationSinceBoot() / time.Second), nil }

func filetimeTicks(value windows.Filetime) uint64 {
	return uint64(value.HighDateTime)<<32 | uint64(value.LowDateTime)
}
