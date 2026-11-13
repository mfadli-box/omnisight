//go:build linux

// Argumen ping Linux (iputils): -n tanpa resolusi DNS, -c 1 satu paket,
// -W timeout detik (integer).
package probes

import (
	"strconv"
	"time"
)

// pingCommand mengembalikan binary + argumen eksplisit (tanpa shell).
func pingCommand(host string, timeout time.Duration) (string, []string) {
	secs := int(timeout.Seconds())
	if secs < 1 {
		secs = 1
	}
	return "ping", []string{"-n", "-c", "1", "-W", strconv.Itoa(secs), host}
}
