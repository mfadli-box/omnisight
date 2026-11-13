package domain

import "errors"

// Error domain murni — tanpa detail transport (detail hanya untuk log di
// infrastructure, tidak pernah meracuni pesan domain). Tanpa prefiks nama
// agent — entrypoint (main.go) yang menambahkan prefiks saat mencetak.
var (
	// ErrUnreachable — upstream osc_rest tidak terjangkau (network/TLS/5xx).
	ErrUnreachable = errors.New("layanan upstream tidak terjangkau")
	// ErrInvalidResponse — respons upstream melanggar kontrak JSON.
	ErrInvalidResponse = errors.New("respons upstream tidak valid")
	// ErrUnauthorized — HMAC ditolak (signature/salah, replay, agent tidak ada).
	ErrUnauthorized = errors.New("autentikasi agent ditolak")
	// ErrRejected — request valid tapi ditolak server (4xx selain 401).
	ErrRejected = errors.New("request ditolak upstream")
	// ErrNotEnrolled — kredensial agent belum ada di state lokal.
	ErrNotEnrolled = errors.New("agent belum ter-enroll")
	// ErrUnavailable — sumber data lokal (mis. Docker daemon) tidak tersedia.
	ErrUnavailable = errors.New("sumber data lokal tidak tersedia")
	// ErrInvalidEvent — payload FIM melanggar invariant kontrak W3.
	ErrInvalidEvent = errors.New("event FIM tidak valid")
)
