// Package platform — adapter lifecycle OS untuk agent. Implementasi
// per-OS dipisah lewat build tag: service_linux.go (systemd/console) dan
// service_windows.go (SCM Windows Service). File ini bebas build tag.
package platform

import (
	"context"
	"log/slog"
)

// Runner mengelola lifecycle eksekusi sesuai lingkungan OS: memblok
// hingga OS/console meminta berhenti, lalu memicu pembatalan context agar
// dispatcher/listener/scheduler drain dengan bersih.
type Runner interface {
	AwaitStop(ctx context.Context, cancel context.CancelFunc) error
}

// NewRunner memilih implementasi Runner sesuai OS dan mode eksekusi.
// forceConsole memaksa mode console (melewati deteksi Windows Service).
func NewRunner(logger *slog.Logger, forceConsole bool) Runner {
	return newOSRunner(logger, forceConsole)
}
