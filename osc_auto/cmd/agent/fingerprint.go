package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strings"
)

type hostFingerprint struct {
	MotherboardUUID string `json:"motherboard_uuid"`
	MACAddress      string `json:"mac_address"`
	CPUSerial       string `json:"cpu_serial"`
	Hostname        string `json:"hostname"`
	Fingerprint     string `json:"fingerprint"`
}

func collectFingerprint(ctx context.Context) (hostFingerprint, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return hostFingerprint{}, errors.New("read hostname")
	}
	fp := hostFingerprint{Hostname: strings.TrimSpace(hostname)}
	if runtime.GOOS == "windows" {
		fp.MotherboardUUID = windowsProperty(ctx, "Win32_ComputerSystemProduct", "UUID")
		fp.CPUSerial = windowsProperty(ctx, "Win32_Processor", "ProcessorId")
	} else {
		fp.MotherboardUUID = readTrimmed("/sys/class/dmi/id/product_uuid")
		for _, line := range strings.Split(readTrimmed("/proc/cpuinfo"), "\n") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 && strings.EqualFold(strings.TrimSpace(parts[0]), "Serial") {
				fp.CPUSerial = strings.TrimSpace(parts[1])
				break
			}
		}
	}
	interfaces, err := net.Interfaces()
	if err != nil {
		return hostFingerprint{}, errors.New("read network interfaces")
	}
	var candidates []string
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 || len(iface.HardwareAddr) != 6 {
			continue
		}
		if iface.HardwareAddr[0]&1 != 0 || iface.HardwareAddr.String() == "00:00:00:00:00:00" {
			continue
		}
		candidates = append(candidates, strings.ToLower(iface.HardwareAddr.String()))
	}
	sort.Strings(candidates)
	if len(candidates) > 0 {
		fp.MACAddress = candidates[0]
	}
	if fp.MotherboardUUID == "" && fp.MACAddress == "" && fp.CPUSerial == "" {
		return hostFingerprint{}, errors.New("no stable hardware identifier available")
	}
	// Length-delimited fields avoid ambiguous concatenation.
	canonical := fp.MotherboardUUID + "\x00" + fp.MACAddress + "\x00" + fp.CPUSerial + "\x00" + fp.Hostname
	sum := sha256.Sum256([]byte(canonical))
	fp.Fingerprint = hex.EncodeToString(sum[:])
	return fp, nil
}

func readTrimmed(path string) string {
	value, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(value))
}

func windowsProperty(ctx context.Context, class, property string) string {
	// Arguments are fixed literals supplied by this package, never remote input.
	command := "(Get-CimInstance -ClassName " + class + " | Select-Object -First 1 -ExpandProperty " + property + ")"
	output, err := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}
