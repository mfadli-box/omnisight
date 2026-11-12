// Package domain — layer paling dalam: entitas, error domain, dan port
// (interface). ATURAN: ZERO import framework, HTTP, syscall OS, atau driver
// database — hanya stdlib murni.
package domain

import "context"

// ServiceHealth adalah snapshot kesehatan service upstream, mengikuti
// kontrak `osc_docs/rest/api-core-foundation.md`.
type ServiceHealth struct {
	Service   string `json:"service"`
	Status    string `json:"status"`
	Reachable bool   `json:"reachable"`
}

// RustAPIProbe adalah port ke osc_rest — diimplementasikan oleh
// infrastructure/rustapi dan dikonsumsi usecase lewat interface ini saja.
type RustAPIProbe interface {
	// ProbeHealth menanyakan GET /api/v1/health pada osc_rest.
	ProbeHealth(ctx context.Context) (ServiceHealth, error)
}
