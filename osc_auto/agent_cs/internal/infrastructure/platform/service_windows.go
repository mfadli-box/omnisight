//go:build windows

// Adapter lifecycle Windows: agent otomatis terdeteksi sebagai Windows
// Service (SCM) atau console. Implementasi memakai
// golang.org/x/sys/windows/svc (tanpa util eksternal seperti NSSM).
package platform

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"time"

	"golang.org/x/sys/windows/svc"
)

// serviceName harus sama dengan nama service saat registrasi SCM
// (lihat deploy/windows/install-service.ps1).
const serviceName = "agent_cs"

// newOSRunner dipanggil NewRunner (lihat runner.go).
func newOSRunner(logger *slog.Logger, forceConsole bool) Runner {
	if forceConsole {
		return &windowsConsoleRunner{logger: logger}
	}
	inService, err := svc.IsWindowsService()
	if err != nil {
		logger.Warn("deteksi lingkungan SCM gagal, fallback ke console", "err", err)
		return &windowsConsoleRunner{logger: logger}
	}
	if inService {
		return &windowsServiceRunner{logger: logger}
	}
	return &windowsConsoleRunner{logger: logger}
}

// windowsServiceRunner berjalan di bawah Service Control Manager.
type windowsServiceRunner struct {
	logger *slog.Logger
}

// AwaitStop mendelegasikan lifecycle ke svc.Run (blocking sampai service
// melaporkan Stopped). cancel dipanggil dari svcHandler saat Stop/Shutdown.
func (r *windowsServiceRunner) AwaitStop(ctx context.Context, cancel context.CancelFunc) error {
	return svc.Run(serviceName, &svcHandler{cancel: cancel, logger: r.logger})
}

// svcHandler mengimplementasikan svc.Handler.
type svcHandler struct {
	cancel context.CancelFunc
	logger *slog.Logger
}

// Execute dipanggil SCM saat service dimulai; HARUS tidak kembali sebelum
// service berhenti (pola resmi x/sys/windows/svc/example).
func (h *svcHandler) Execute(_ []string, req <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown

	changes <- svc.Status{State: svc.StartPending}
	h.logger.Info("service berjalan di bawah SCM")
	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}

	for change := range req {
		switch change.Cmd {
		case svc.Interrogate:
			changes <- change.CurrentStatus
			// Workaround deadlock interrogate (golang.org/x/sys
			// code.google.com/p/winsvc/issues/detail?id=4).
			time.Sleep(100 * time.Millisecond)
			changes <- change.CurrentStatus
		case svc.Stop, svc.Shutdown:
			h.logger.Info("permintaan stop dari SCM")
			changes <- svc.Status{State: svc.StopPending}
			// Batalkan context → scheduler berhenti; drain penuh (WaitGroup)
			// tetap dilakukan main setelah svc.Run kembali.
			h.cancel()
			// Settle singkat agar transisi status SCM bersih.
			time.Sleep(time.Second)
			changes <- svc.Status{State: svc.Stopped}
			return false, 0
		default:
			h.logger.Warn("permintaan kontrol SCM tidak dikenal", "cmd", change.Cmd)
		}
	}
	changes <- svc.Status{State: svc.Stopped}
	return false, 0
}

// windowsConsoleRunner berjalan interaktif (manual / sesi debug).
type windowsConsoleRunner struct {
	logger *slog.Logger
}

// AwaitStop memblokir sampai CTRL+C (os.Interrupt) atau ctx dibatalkan.
func (r *windowsConsoleRunner) AwaitStop(ctx context.Context, cancel context.CancelFunc) error {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt)
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
