// Helper konfigurasi & environment — entrypoint main.go.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// envOr — baca env dengan default.
func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// envBool — baca env boolean (default def; nilai tidak valid → def).
func envBool(key string, def bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

// parseIntEnv — baca env int dengan default; error eksplisit bila malformed.
func parseIntEnv(key string, def int) (int, error) {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def, fmt.Errorf("%s bukan angka valid: %s", key, v)
	}
	return n, nil
}

// parseDurationEnv — baca env durasi (format time.ParseDuration).
func parseDurationEnv(key string, def time.Duration) (time.Duration, error) {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def, fmt.Errorf("%s bukan durasi valid (contoh 30s/5m/24h): %s", key, v)
	}
	return d, nil
}

// defaultQueuePath — antrean disandingkan dengan state (direktori sama,
// terproteksi 0700): <dir_state>/queue.json.
func defaultQueuePath(statePath string) string {
	if statePath == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(statePath), "queue.json")
}
