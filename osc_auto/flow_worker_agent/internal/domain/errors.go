// Package domain — entitas bisnis murni flow_worker_agent + definisi port.
// NOLI: package ini dilarang mengimpor framework, net/http, syscall, atau
// driver eksternal (aturan Clean Architecture skill ai-auto).
package domain

import "errors"

// Error domain murni — tanpa detail transport (detail hanya untuk log di
// infrastructure; pesan domain tidak meracuni keputusan retry internal).
var (
	// ErrUnreachable — upstream (osc_rest / SMTP / Telegram / webhook) tidak terjangkau.
	ErrUnreachable = errors.New("layanan upstream tidak terjangkau")
	// ErrInvalidResponse — respons upstream melanggar kontrak JSON.
	ErrInvalidResponse = errors.New("respons upstream tidak valid")
	// ErrUnauthorized — autentikasi ditolak (HMAC salah/replay, kredensial salah).
	ErrUnauthorized = errors.New("autentikasi ditolak")
	// ErrRejected — request valid tapi ditolak upstream (4xx selain 401).
	ErrRejected = errors.New("request ditolak upstream")
	// ErrNotEnrolled — kredensial agent belum ada di state lokal.
	ErrNotEnrolled = errors.New("agent belum ter-enroll")
	// ErrInvalidMessage — pesan enqueue melanggar invariant (event_id kosong, dsb.).
	ErrInvalidMessage = errors.New("pesan notifikasi tidak valid")
	// ErrQueueFull — antrean lokal penuh (backpressure ke produsen).
	ErrQueueFull = errors.New("antrean notifikasi penuh")
	// ErrDuplicated — event_id sudah pernah diproses sukses (dedupe window).
	ErrDuplicated = errors.New("event sudah pernah diproses")
	// ErrAuthRequired — listener berjalan tanpa shared secret (konfigurasi tidak aman).
	ErrAuthRequired = errors.New("listener membutuhkan shared secret")
)
