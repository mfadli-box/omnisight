// Package delivery — adapter sesi WebSocket bastion: menjembatani server
// WS (infrastructure/wsserver) ke use case bastion. Bagian layer luar
// Clean Architecture; boleh bergantung pada usecase secara konkret.
package delivery

import (
	"context"
	"log/slog"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/usecase"
)

// ServeSession menjalankan satu sesi bastion (blocking). Dipanggil satu
// goroutine per koneksi WS oleh server. clientIP hanya untuk audit log.
func ServeSession(ctx context.Context, bastion *usecase.BastionService,
	stream domain.TerminalStream, clientIP string, logger *slog.Logger) {
	logger.Debug("sesi bastion mulai", "client_ip", clientIP)
	bastion.HandleSession(ctx, stream, time.Now())
}
