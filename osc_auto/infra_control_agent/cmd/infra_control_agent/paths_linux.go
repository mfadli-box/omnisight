//go:build linux

package main

import (
	"path/filepath"
	"strings"
)

// defaultStacksDir — root direktori compose stack pada Linux.
func defaultStacksDir() string { return "/opt/omnisight/stacks" }

// defaultNginxConfigDir — direktori file konfigurasi vhost (termasuk dalam
// include utama /etc/nginx/nginx.conf).
func defaultNginxConfigDir() string { return "/etc/nginx/conf.d" }

// isAbs — cek path absolut.
func isAbs(p string) bool {
	return filepath.IsAbs(p) && strings.HasPrefix(p, "/")
}
