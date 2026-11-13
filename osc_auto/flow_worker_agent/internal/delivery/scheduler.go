// Package delivery — adapter wiring listener HTTP (inbound) ke antrean.
// Bagian layer luar Clean Architecture.
package delivery

import (
	"log/slog"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/listener"
)

// NewListener membangun listener terhubung ke antrean domain (validasi
// secret deny-by-default terjadi di listener.New).
func NewListener(addr, secretHex string, q domain.MessageQueue, logger *slog.Logger) (*listener.Server, error) {
	return listener.New(addr, secretHex, q, logger)
}
