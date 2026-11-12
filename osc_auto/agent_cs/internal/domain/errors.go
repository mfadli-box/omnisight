package domain

import "errors"

// Error domain murni — tanpa detail transport (detail hanya untuk log di
// infrastructure, tidak pernah meracuni pesan domain). Tanpa prefiks nama
// agent — entrypoint (main.go) yang menambahkan prefiks saat mencetak.
var (
	ErrUnreachable     = errors.New("layanan upstream tidak terjangkau")
	ErrInvalidResponse = errors.New("respons upstream tidak valid")
)
