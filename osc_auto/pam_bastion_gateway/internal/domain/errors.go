// Package domain — error murni PAM bastion (tanpa detail transport).
package domain

import "errors"

var (
	// ErrUnreachable — osc_rest / target SSH tidak terjangkau.
	ErrUnreachable = errors.New("layanan upstream tidak terjangkau")
	// ErrInvalidResponse — respons osc_rest melanggar kontrak JSON.
	ErrInvalidResponse = errors.New("respons upstream tidak valid")
	// ErrUnauthorized — HMAC ditolak (signature/replay/agent tidak ada)
	// atau ticket kedaluwarsa.
	ErrUnauthorized = errors.New("autentikasi ditolak")
	// ErrRejected — request valid tapi ditolak (4xx selain 401/409).
	ErrRejected = errors.New("request ditolak upstream")
	// ErrTicketUsed — ticket sudah pernah ditebus (HTTP 409, sekali pakai).
	ErrTicketUsed = errors.New("ticket sudah pernah ditebus")
	// ErrNotEnrolled — kredensial agent gateway belum ada di state lokal.
	ErrNotEnrolled = errors.New("gateway belum ter-enroll")
	// ErrInvalidTicket — format ticket tidak valid (kosong/terlalu panjang).
	ErrInvalidTicket = errors.New("format ticket tidak valid")
	// ErrUnsupportedAccount — tipe akun tidak dapat diproxy SSH.
	ErrUnsupportedAccount = errors.New("tipe akun tidak didukung bastion SSH")
	// ErrHostKeyUnknownFirstUse — host key target tidak ada di known_hosts
	// (TOFU: klien menyetujui menyimpan fingerprint berikutnya).
	ErrHostKeyUnknownFirstUse = errors.New("host key target belum dikenal")
	// ErrSessionLimit — batas sesi konkuren gateway tercapai.
	ErrSessionLimit = errors.New("batas sesi konkuren tercapai")
)
