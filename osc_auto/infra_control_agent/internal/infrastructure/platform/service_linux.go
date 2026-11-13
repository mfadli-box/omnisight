//go:build linux

// Adapter lifecycle Linux: agent berjalan foreground (systemd Type=simple)
// dan berhenti via sinyal SIGINT/SIGTERM yang dikirim systemd saat stop.
package platform

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
)

type linuxRunner struct {
	logger *slog.Logger
}

// newOSRunner dipanggil NewRunner (lihat runner.go).
func newOSRunner(logger *slog.Logger, _ bool) Runner {
	// Di Linux agent selalu foreground; --run-console tidak mengubah mode.
	return &linuxRunner{logger: logger}
}

// AwaitStop memblokir sampai SIGINT/SIGTERM diterima atau ctx sudah
// dibatalkan dari luar, lalu memanggil cancel agar worker berhenti.
func (r *linuxRunner) AwaitStop(ctx context.Context, cancel context.CancelFunc) error {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(sig)

	select {
	case s := <-sig:
		r.logger.Info("sinyal berhenti diterima", "signal", s.String())
		cancel()
		return nil
	case <-ctx.Done():
		return nil
	}
}
