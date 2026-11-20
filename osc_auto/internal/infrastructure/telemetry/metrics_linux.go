//go:build linux

package telemetry

import (
	"bufio"
	"errors"
	"os"
	"strconv"
	"strings"
	"syscall"
)

func hostname() (string, error) { return os.Hostname() }

func operatingSystemVersion() (string, error) {
	file, err := os.Open("/etc/os-release")
	if err != nil {
		return "linux", nil
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 1024), 16<<10)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			return strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), "\""), nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return "linux", nil
}

func cpuTimes() (uint64, uint64, error) {
	file, err := os.Open("/proc/stat")
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return 0, 0, err
		}
		return 0, 0, errors.New("cpu counters unavailable")
	}
	fields := strings.Fields(scanner.Text())
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0, errors.New("cpu counters malformed")
	}
	var total, idle uint64
	// guest and guest_nice are already accounted for in user and nice.
	for index, value := range fields[1:min(len(fields), 9)] {
		ticks, err := strconv.ParseUint(value, 10, 64)
		if err != nil {
			return 0, 0, errors.New("cpu counters malformed")
		}
		total += ticks
		if index == 3 || index == 4 {
			idle += ticks
		}
	}
	return idle, total, nil
}

func memory() (uint64, uint64, error) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()
	var total, available uint64
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 1024), 64<<10)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		value, parseErr := strconv.ParseUint(fields[1], 10, 64)
		if parseErr != nil {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			total = value * 1024
		case "MemAvailable:":
			available = value * 1024
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, 0, err
	}
	if total == 0 || available > total {
		return 0, 0, errors.New("memory counters unavailable")
	}
	return total, total - available, nil
}

func disk() (uint64, uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err != nil {
		return 0, 0, err
	}
	blockSize := uint64(stat.Bsize)
	total := stat.Blocks * blockSize
	free := stat.Bavail * blockSize
	if free > total {
		return 0, 0, errors.New("disk counters invalid")
	}
	return total, total - free, nil
}

func uptime() (uint64, error) {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0, err
	}
	fields := strings.Fields(string(data))
	if len(fields) == 0 {
		return 0, errors.New("uptime unavailable")
	}
	seconds, err := strconv.ParseFloat(fields[0], 64)
	if err != nil || seconds < 0 {
		return 0, errors.New("uptime malformed")
	}
	return uint64(seconds), nil
}
