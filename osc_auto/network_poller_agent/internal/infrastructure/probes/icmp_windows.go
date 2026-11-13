//go:build windows

// Argumen ping Windows: -n 1 satu paket, -w timeout milidetik.
package probes

import (
	"strconv"
	"time"
)

// pingCommand mengembalikan binary + argumen eksplisit (tanpa shell).
func pingCommand(host string, timeout time.Duration) (string, []string) {
	ms := timeout.Milliseconds()
	if ms < 1000 {
		ms = 1000
	}
	return "ping", []string{"-n", "1", "-w", strconv.FormatInt(ms, 10), host}
}
