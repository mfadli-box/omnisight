//go:build linux

package storage

// defaultStatePath — lokasi state pada Linux (direktori data FHS).
func defaultStatePath() string {
	return "/var/lib/flow_worker_agent/state.json"
}
