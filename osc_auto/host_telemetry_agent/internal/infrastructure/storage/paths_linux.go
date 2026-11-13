//go:build linux

package storage

// defaultStatePath — lokasi state pada Linux (direktori data FHS).
func defaultStatePath() string {
	return "/var/lib/host_telemetry_agent/state.json"
}
