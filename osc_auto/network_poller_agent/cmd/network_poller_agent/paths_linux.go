//go:build linux

package main

// defaultMonitorsPath — lokasi default file monitors.json pada Linux
// (direktori konfigurasi FHS; chmod 0600 karena memuat SNMP community).
func defaultMonitorsPath() string {
	return "/etc/network_poller_agent/monitors.json"
}
