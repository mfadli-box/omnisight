//go:build windows

package main

// defaultMonitorsPath — lokasi default file monitors.json pada Windows.
func defaultMonitorsPath() string {
	return `C:\ProgramData\network_poller_agent\monitors.json`
}
