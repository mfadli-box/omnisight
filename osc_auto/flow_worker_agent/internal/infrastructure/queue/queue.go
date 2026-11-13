// Package queue — antrean pesan notifikasi durable lokal.
//
// Desain:
//   - Durabilitas: file JSON atomik (tmp → rename) di direkotri 0700,
//     file 0600; opsional AES-256-GCM via FLOW_WORKER_QUEUE_KEY_HEX
//     (payload mengandung config channel ber-secret — enkripsi disarankan).
//   - Dedupe: event_id yang sudah sukses dikirim disimpan di set LRU
//     (kapasitas completedCap) — redelivery produsen tidak dikirim ganda.
//   - Retry: Attempts + NextAttemptAt disimpan per pesan; pesan yang
//     melewati maxAttempts dibuang (dead-letter) dan dihitung.
//   - Aman dipanggil lintas goroutine (dispatcher + listener HTTP).
package queue

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

const (
	// completedCap — kapasitas set dedupe (event_id terakhir yang sukses).
	completedCap = 4096
	// maxQueueHard — batas hard jumlah pesan pending (backpressure).
	maxQueueHard = 10_000
)

// Option — opsi konstruksi Queue (untuk tuning & test).
type Option func(*Queue)

// WithMaxPending mengubah batas pending (test backpressure cepat; produksi
// memakai maxQueueHard).
func WithMaxPending(n int) Option {
	return func(q *Queue) {
		if n > 0 {
			q.maxPending = n
		}
	}
}

// ErrQueueFull di-alias ulang agar pemanggil tidak mengimpor domain hanya
// untuk pengecekan error antrean.
var ErrQueueFull = domain.ErrQueueFull

// diskState — bentuk tersimpan di disk.
type diskState struct {
	Version      int                      `json:"version"`
	Pending      []domain.OutboundMessage `json:"pending"`
	Completed    []string                 `json:"completed,omitempty"`
	DeadLettered int64                    `json:"dead_lettered"`
}

// Queue implementasi domain.MessageQueue.
type Queue struct {
	mu           sync.Mutex
	path         string
	key          []byte // nil = tanpa enkripsi
	maxPending   int
	pending      []domain.OutboundMessage
	completed    map[string]struct{}
	completedOrd []string // urutan insertion untuk evict LRU
	deadLettered int64
}

// Open memuat (atau membuat) antrean di path.
func Open(path, keyHex string, opts ...Option) (*Queue, error) {
	if path == "" {
		return nil, errors.New("path antrean kosong")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("membuat direktori antrean: %w", err)
	}
	q := &Queue{path: path, maxPending: maxQueueHard, completed: make(map[string]struct{})}
	for _, opt := range opts {
		opt(q)
	}
	if keyHex != "" {
		if len(keyHex) != 64 {
			return nil, errors.New("QUEUE_KEY_HEX harus 64 karakter hex (32 byte AES-256-GCM)")
		}
		key, err := hex.DecodeString(keyHex)
		if err != nil {
			return nil, fmt.Errorf("QUEUE_KEY_HEX bukan hex valid: %w", err)
		}
		q.key = key
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return q, nil // antrean baru
		}
		return nil, fmt.Errorf("membaca antrean: %w", err)
	}
	plain := raw
	if q.key != nil {
		if plain, err = decryptAESGCM(q.key, raw); err != nil {
			return nil, fmt.Errorf("dekripsi antrean: %w", err)
		}
	}
	var st diskState
	if err := json.Unmarshal(plain, &st); err != nil {
		return nil, fmt.Errorf("antrean korup: %w", err)
	}
	q.pending = st.Pending
	q.deadLettered = st.DeadLettered
	for _, id := range st.Completed {
		q.completed[id] = struct{}{}
		q.completedOrd = append(q.completedOrd, id)
	}
	return q, nil
}

// Enqueue menambah pesan (dedupe event_id, backpressure kapasitas).
func (q *Queue) Enqueue(m domain.OutboundMessage) error {
	if err := m.Validate(); err != nil {
		return err
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	if _, done := q.completed[m.EventID]; done {
		return domain.ErrDuplicated
	}
	for _, p := range q.pending {
		if p.EventID == m.EventID {
			return domain.ErrDuplicated // masih menunggu dikirim
		}
	}
	if len(q.pending) >= q.maxPending {
		return fmt.Errorf("%w (maks %d)", ErrQueueFull, q.maxPending)
	}
	if m.EnqueuedAt.IsZero() {
		m.EnqueuedAt = time.Now().UTC()
	}
	q.pending = append(q.pending, m)
	return q.persistLocked()
}

// ClaimDue mengambil maksimal max pesan yang jatuh tempo.
func (q *Queue) ClaimDue(now time.Time, max int) []domain.OutboundMessage {
	q.mu.Lock()
	defer q.mu.Unlock()
	var due []domain.OutboundMessage
	kept := q.pending[:0]
	for _, m := range q.pending {
		switch {
		case len(due) < max && (m.NextAttemptAt.IsZero() || !m.NextAttemptAt.After(now)):
			due = append(due, m)
		default:
			kept = append(kept, m)
		}
	}
	q.pending = append([]domain.OutboundMessage(nil), kept...)
	return due
}

// Ack menandai pesan sukses (hapus + simpan dedupe).
func (q *Queue) Ack(eventID string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if _, ok := q.completed[eventID]; !ok {
		q.completed[eventID] = struct{}{}
		q.completedOrd = append(q.completedOrd, eventID)
		if len(q.completedOrd) > completedCap {
			oldest := q.completedOrd[0]
			q.completedOrd = q.completedOrd[1:]
			delete(q.completed, oldest)
		}
	}
	_ = q.persistLocked()
}

// Retry menjadwalkan ulang pesan. Mengembalikan false (dan menghitung
// dead-letter) bila attempts melewati maxAttempts.
func (q *Queue) Retry(m domain.OutboundMessage, delay time.Duration, maxAttempts int) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	m.Attempts++
	if maxAttempts > 0 && m.Attempts >= maxAttempts {
		q.deadLettered++
		_ = q.persistLocked()
		return false
	}
	m.NextAttemptAt = time.Now().UTC().Add(delay)
	q.pending = append(q.pending, m)
	_ = q.persistLocked()
	return true
}

// Len — jumlah pesan pending.
func (q *Queue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.pending)
}

// DeadLettered — total pesan yang dibuang setelah habis percobaan.
func (q *Queue) DeadLettered() int64 {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.deadLettered
}

// persistLocked menulis antrean atomik — WAJIB memegang q.mu.
func (q *Queue) persistLocked() error {
	st := diskState{Version: 1, Pending: q.pending, Completed: q.completedOrd, DeadLettered: q.deadLettered}
	plain, err := json.Marshal(st)
	if err != nil {
		return fmt.Errorf("serialisasi antrean: %w", err)
	}
	payload := plain
	if q.key != nil {
		if payload, err = encryptAESGCM(q.key, plain); err != nil {
			return err
		}
	}
	tmp := q.path + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o600); err != nil {
		return fmt.Errorf("menulis antrean sementara: %w", err)
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("chmod antrean: %w", err)
	}
	if err := os.Rename(tmp, q.path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename antrean: %w", err)
	}
	return nil
}

// encryptAESGCM — AEAD AES-256-GCM, nonce 96-bit acak per enkripsi.
func encryptAESGCM(key, plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ct := gcm.Seal(nil, nonce, plain, nil)
	env := struct {
		Version int    `json:"v"`
		Alg     string `json:"alg"`
		Nonce   string `json:"nonce"`
		Data    string `json:"data"`
	}{Version: 1, Alg: "AES-256-GCM", Nonce: base64.StdEncoding.EncodeToString(nonce), Data: base64.StdEncoding.EncodeToString(ct)}
	return json.Marshal(env)
}

// decryptAESGCM — kebalikan encryptAESGCM.
func decryptAESGCM(key, raw []byte) ([]byte, error) {
	var env struct {
		Version int    `json:"v"`
		Alg     string `json:"alg"`
		Nonce   string `json:"nonce"`
		Data    string `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, fmt.Errorf("envelope antrean tidak valid: %w", err)
	}
	if env.Alg != "AES-256-GCM" {
		return nil, fmt.Errorf("algoritma antrean tidak didukung: %s", env.Alg)
	}
	nonce, err := base64.StdEncoding.DecodeString(env.Nonce)
	if err != nil {
		return nil, err
	}
	ct, err := base64.StdEncoding.DecodeString(env.Data)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, nonce, ct, nil)
}
