//go:build linux

// Adapter FIM Linux: path direktori kritis default + uid/gid via syscall.
package platform

import (
	"os"
	"syscall"
)

// defaultFimPaths — path kritikal Linux yang dipantau default (ringan:
// /etc penuh + binary lokal; /usr/bin sengaja tidak default — sangat
// besar; operator dapat menambah via HOST_TELEMETRY_FIM_PATHS).
func defaultFimPaths() []string {
	return []string{
		"/etc",
		"/usr/local/bin",
		"/usr/local/sbin",
	}
}

func uidOf(info os.FileInfo) int {
	if st, ok := info.Sys().(*syscall.Stat_t); ok {
		return int(st.Uid)
	}
	return 0
}

func gidOf(info os.FileInfo) int {
	if st, ok := info.Sys().(*syscall.Stat_t); ok {
		return int(st.Gid)
	}
	return 0
}
