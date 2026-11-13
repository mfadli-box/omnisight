// Package usecase — Session Recorder: menulis stream terminal ke format
// asciicast v2 (https://github.com/asciinema/asciinema) + gzip (CAST_GZ),
// dengan batas ukuran & hash SHA-256 inkremental untuk upload ke osc_rest.
package usecase

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

const (
	// recordingMaxGz — batas ukuran gzip terkirim (kontrak server default
	// PAM_RECORDING_MAX_MB = 100 MB, clamp 1–512). Rekam berhenti (bukan
	// sesi) saat tercapai; event berikutnya dilewati sampai sesi tutup.
	recordingMaxGz = 100 << 20
)

// Recorder menulis event terminal ke buffer gzip in-memory.
// Session REC hanya menampung output (event "o") + input yang lolos ACL
// (event "i") — secret TIDAK PERNAH masuk (SSH auth terjadi sebelum
// recorder dimulai dan ACL menyaring input).
type Recorder struct {
	gz    *gzip.Writer
	buf   *cappedWriter
	start time.Time
	// truncated menandai rekaman berhenti karena batas ukuran.
	truncated bool
}

// cappedWriter menulis ke buffer dengan batas hard.
type cappedWriter struct {
	b    []byte
	max  int
	full bool
}

func (w *cappedWriter) Write(p []byte) (int, error) {
	if w.full {
		return 0, io.ErrClosedPipe
	}
	n := len(p)
	room := w.max - len(w.b)
	// All-or-nothing + headroom untuk flush/trailer gzip saat Close —
	// menjamin body CAST_GZ tetap gzip valid saat cap tercapai (truncated).
	if room <= 0 || n > room-gzHeadroom {
		w.full = true
		return 0, io.ErrShortWrite
	}
	w.b = append(w.b, p...)
	return n, nil
}

// gzHeadroom — ruang cadangan untuk flush blok deflate + trailer gzip saat
// Close agar rekaman truncated tetap gzip valid.
const gzHeadroom = 64

// NewRecorder membangun recorder CAST_GZ.
func NewRecorder(started time.Time) *Recorder {
	buf := &cappedWriter{max: recordingMaxGz}
	return &Recorder{
		gz:    gzip.NewWriter(buf),
		buf:   buf,
		start: started,
	}
}

// header asciicast v2 — line pertama file.
type castHeader struct {
	Version   int               `json:"version"`
	Width     int               `json:"width"`
	Height    int               `json:"height"`
	Timestamp int64             `json:"timestamp"`
	Env       map[string]string `json:"env"`
	Title     string            `json:"title,omitempty"`
}

type castEvent struct {
	Time  float64 `json:"ts"` // asciinema v2: [time, event, data] — kita pakai objek agar JSONB sederhana
	Event string  `json:"event"`
	Data  string  `json:"data"`
}

// Start menulis header asciicast (dipanggil sekali setelah sesi aktif).
func (r *Recorder) Start(term string, rows, cols int) {
	if r.gz == nil {
		return
	}
	h := castHeader{
		Version:   2,
		Width:     cols,
		Height:    rows,
		Timestamp: r.start.Unix(),
		Env:       map[string]string{"TERM": term, "SHELL": "/bin/bash"},
	}
	if h.Width <= 0 {
		h.Width = 80
	}
	if h.Height <= 0 {
		h.Height = 24
	}
	line, err := json.Marshal(h)
	if err == nil {
		_, _ = r.gz.Write(append(line, '\n'))
	}
}

// Output mencatat event output remote (o).
func (r *Recorder) Output(data []byte) {
	r.event("o", data)
}

// Input mencatat event input yang lolos ACL (i).
func (r *Recorder) Input(data []byte) {
	r.event("i", data)
}

func (r *Recorder) event(kind string, data []byte) {
	if r.gz == nil || r.truncated || r.buf.full {
		return
	}
	ev := castEvent{Time: time.Since(r.start).Seconds(), Event: kind, Data: string(data)}
	line, err := json.Marshal(ev)
	if err != nil {
		return
	}
	if _, err := r.gz.Write(append(line, '\n')); err != nil {
		// Batas ukuran tercapai → hentikan perekaman (sesi tetap jalan);
		// Close best-effort — error flush wajar saat buffer penuh.
		r.truncated = true
		_ = r.gz.Close()
		r.gz = nil
	}
}

// Finalize menutup gzip dan mengembalikan body CAST_GZ siap upload.
// sha256 dihitung atas byte terkompresi (yang dikirim = yang di-hash —
// signature HMAC osc_rest mengikat sha256(body)). Rekaman truncated tetap
// diunggah (server memvalidasi magic bytes + sha256), error Close akibat
// buffer penuh dianggap wajar.
func (r *Recorder) Finalize() (body []byte, sha256Hex string, truncated bool, err error) {
	if r.gz != nil {
		cerr := r.gz.Close()
		r.gz = nil
		if cerr != nil && !r.buf.full {
			return nil, "", r.truncated, fmt.Errorf("menutup gzip rekaman: %w", cerr)
		}
		if r.buf.full {
			r.truncated = true
		}
	}
	body = r.buf.b
	sum := sha256.Sum256(body)
	return body, hex.EncodeToString(sum[:]), r.truncated, nil
}
