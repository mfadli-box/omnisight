package domain

import "errors"

// Error domain murni — tanpa detail transport. Tanpa prefiks nama agent —
// entrypoint (main.go) yang menambahkan prefiks saat mencetak.
var (
	// ErrUnreachable — upstream osc_rest tidak terjangkau (network/TLS/5xx).
	ErrUnreachable = errors.New("layanan upstream tidak terjangkau")
	// ErrInvalidResponse — respons upstream melanggar kontrak JSON.
	ErrInvalidResponse = errors.New("respons upstream tidak valid")
	// ErrUnauthorized — HMAC ditolak (signature salah, replay, agent tidak ada).
	ErrUnauthorized = errors.New("autentikasi agent ditolak")
	// ErrRejected — request valid tapi ditolak server (4xx selain 401).
	ErrRejected = errors.New("request ditolak upstream")
	// ErrNotEnrolled — kredensial agent belum ada di state lokal.
	ErrNotEnrolled = errors.New("agent belum ter-enroll")
	// ErrNotFound — tidak ada dispatch pending / sumber konfigurasi hilang.
	ErrNotFound = errors.New("sumber tidak ditemukan")
	// ErrPathUnsafe — target path melanggar validasi ketat (traversal/symlink).
	ErrPathUnsafe = errors.New("path tidak aman (di luar root / traversal / symlink)")
)
