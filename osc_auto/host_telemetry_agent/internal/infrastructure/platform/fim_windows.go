//go:build windows

// Adapter FIM Windows: path kritikal default + uid/gid tidak berlaku (0).
package platform

import "os"

// defaultFimPaths — path kritikal Windows yang dipantau default.
// System32\config (hive registry) + drivers\etc (hosts) cukup ringan.
func defaultFimPaths() []string {
	return []string{
		`C:\Windows\System32\drivers\etc`,
		`C:\Windows\System32\config`,
	}
}

func uidOf(_ os.FileInfo) int { return 0 } // uid tidak berlaku di Windows

func gidOf(_ os.FileInfo) int { return 0 } // gid tidak berlaku di Windows
