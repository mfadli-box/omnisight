package usecase

import (
	"bytes"
	"compress/gzip"
	"io"
	"testing"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
)

// --- lineBuf (ACL newline-buffer) -----------------------------------------

func TestLineBufFeedAssemblesLines(t *testing.T) {
	lb := &lineBuf{max: maxInputBuffer}
	lines, overflow := lb.feed([]byte("rm -r"))
	if overflow || len(lines) != 0 {
		t.Fatalf("belum ada newline → tanpa baris: %v %v", lines, overflow)
	}
	lines, _ = lb.feed([]byte("f /\nls\n"))
	if len(lines) != 2 || string(lines[0]) != "rm -rf /" || string(lines[1]) != "ls" {
		t.Fatalf("baris salah: %q", lines)
	}
	// Enter kedua (baris kosong) → baris "".
	lines, _ = lb.feed([]byte("\n"))
	if len(lines) != 1 || len(lines[0]) != 0 {
		t.Fatalf("newline polos harus baris kosong: %q", lines)
	}
}

func TestLineBufOverflowDiscards(t *testing.T) {
	lb := &lineBuf{max: 8}
	lines, overflow := lb.feed(bytes.Repeat([]byte("a"), 20))
	if len(lines) != 0 || !overflow {
		t.Fatalf("buffer penuh harus overflow: %v %v", lines, overflow)
	}
	// Setelah overflow, buffer bersih — baris baru tetap benar.
	lines, overflow = lb.feed([]byte("ok\n"))
	if overflow || len(lines) != 1 || string(lines[0]) != "ok" {
		t.Fatalf("buffer harus reset setelah overflow: %v %v", lines, overflow)
	}
}

// --- Recorder --------------------------------------------------------------

func TestRecorderProducesValidCastGz(t *testing.T) {
	r := NewRecorder(time.Now().UTC())
	r.Start("xterm-256color", 24, 80)
	r.Output([]byte("hello world"))
	r.Input([]byte("whoami\n"))
	r.Output(domain.BlockNotice("rm -rf /"))
	body, shaHex, truncated, err := r.Finalize()
	if err != nil || truncated {
		t.Fatalf("finalize: %v truncated=%v", err, truncated)
	}
	if len(shaHex) != 64 {
		t.Fatalf("sha256 harus hex-64: %q", shaHex)
	}
	// Gzip valid & magic bytes sesuai kontrak (1F 8B).
	if body[0] != 0x1f || body[1] != 0x8b {
		t.Fatalf("magic bytes gzip salah: % x", body[:2])
	}
	zr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	plain, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("decompress: %v", err)
	}
	if !bytes.Contains(plain, []byte(`"version":2`)) {
		t.Fatalf("header asciicast v2 tidak ada: %s", plain)
	}
	if !bytes.Contains(plain, []byte("hello world")) {
		t.Fatalf("event output tidak ada: %s", plain)
	}
	if !bytes.Contains(plain, []byte("DIBLOKIR")) {
		t.Fatalf("notice blokir tidak ter-rekam: %s", plain)
	}
	// Body = gzip → deterministik per isi; sha mencakup seluruh body.
	if len(body) == 0 {
		t.Fatal("body tidak boleh kosong")
	}
}

func TestRecorderStopsAtSizeCap(t *testing.T) {
	r := NewRecorder(time.Now().UTC())
	r.buf.max = 1024 // paksa batas kecil untuk test
	r.Start("xterm", 24, 80)
	for i := 0; i < 500; i++ {
		r.Output(bytes.Repeat([]byte("x"), 128))
	}
	_, _, truncated, err := r.Finalize()
	if err != nil {
		t.Fatalf("finalize: %v", err)
	}
	if !truncated {
		t.Fatal("harus menandai truncated saat cap tercapai")
	}
}

// --- ACL + classify --------------------------------------------------------

func TestClassifyMapsDomainErrors(t *testing.T) {
	if got := classify(domain.ErrUnauthorized); got != "ticket salah/kedaluwarsa" {
		t.Fatalf("classify 401 salah: %s", got)
	}
	if got := classify(domain.ErrUnsupportedAccount); got != "tipe akun tidak didukung bastion SSH" {
		t.Fatalf("classify akun salah: %s", got)
	}
	if got := classify(io.EOF); got != "internal" {
		t.Fatalf("error asing harus internal: %s", got)
	}
}
