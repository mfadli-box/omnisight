package collector

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"omnisight/osc_auto/internal/domain"
)

const dockerHost = "npipe:////./pipe/docker_engine"

func systemMount() string {
	drive := os.Getenv("SystemDrive")
	if drive == "" {
		drive = "C:"
	}
	return filepath.Clean(drive + "\\")
}

// Raw Windows performance counters are cumulative. Windows exposes no Unix load average.
const windowsCounters = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
@{
  disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Where-Object { $_.Size -gt 0 } | Select-Object -First 64 | ForEach-Object {
    @{mount=$_.DeviceID + '\'; used_bytes=[uint64]($_.Size-$_.FreeSpace); total_bytes=[uint64]$_.Size}
  })
  disk_io = @(Get-CimInstance Win32_PerfRawData_PerfDisk_PhysicalDisk | Where-Object Name -ne '_Total' | Select-Object -First 64 | ForEach-Object {
    @{device=$_.Name; read_bytes=[uint64]$_.DiskReadBytesPersec; write_bytes=[uint64]$_.DiskWriteBytesPersec}
  })
  network = @(Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface | Select-Object -First 64 | ForEach-Object {
    @{interface=$_.Name; rx_bytes=[uint64]$_.BytesReceivedPersec; tx_bytes=[uint64]$_.BytesSentPersec}
  })
  temperatures = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | ForEach-Object {
    $_.CurrentTemperature / 10 - 273.15
  })
} | ConvertTo-Json -Depth 4 -Compress
`

func collectPlatform(ctx context.Context, metrics *domain.HostMetrics) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	binary := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	data, err := run(exec.CommandContext(ctx, binary, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsCounters))
	if err != nil {
		return
	}
	var result struct {
		Disks        []domain.DiskUsage
		DiskIO       []domain.DiskIO `json:"disk_io"`
		Network      []domain.NetworkIO
		Temperatures []float64
	}
	if json.Unmarshal(data, &result) != nil {
		return
	}
	if len(result.Disks) > 0 {
		metrics.Disks = result.Disks
	}
	if result.DiskIO != nil {
		metrics.DiskIO = result.DiskIO
	}
	if result.Network != nil {
		metrics.Network = result.Network
	}
	for _, value := range result.Temperatures {
		if value >= -273.15 && value <= 250 && (metrics.Temperature == nil || value > *metrics.Temperature) {
			metrics.Temperature = &value
		}
	}
}
