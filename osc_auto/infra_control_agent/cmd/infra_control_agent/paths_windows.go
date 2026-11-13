//go:build windows

package main

import "path/filepath"

// defaultStacksDir — root direktori compose stack pada Windows.
func defaultStacksDir() string { return `C:\omnisight\stacks` }

// defaultNginxConfigDir — direktori file konfigurasi vhost Windows
// (installasi nginx for Windows standar).
func defaultNginxConfigDir() string { return `C:\nginx\conf` }

// isAbs — cek path absolut (drive letter).
func isAbs(p string) bool { return filepath.IsAbs(p) }
