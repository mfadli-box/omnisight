// Package storage — persistensi kredensial agent lokal (hasil enrollment).
//
// Proteksi:
//   - Linux : direktori 0700, file 0600 (default /var/lib/<agent>/state.json).
//   - Windows: C:\ProgramData\<agent>\state.json (ACL mengikuti inherit
//     ProgramData; deploy script membatasi ACL — lihat README §5).
//   - Opsional: enkripsi AES-256-GCM bila env HOST_TELEMETRY_STATE_KEY_HEX
//     (64 hex char = 32 byte key) diset — file menjadi envelope
//     {v,alg,nonce,data} base64. Tanpa key: JSON polos + permission ketat.
package storage

import (
	"context"
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
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
)

// ErrNotFound — state belum ada (belum enroll).
var ErrNotFound = errors.New("state agent belum ada")

// AgentState — bentuk tersimpan di disk.
type AgentState struct {
	AgentID    string    `json:"agent_id"`
	CompanyID  string    `json:"company_id"`
	HmacSecret string    `json:"hmac_secret"`
	NodeType   string    `json:"node_type"`
	AssetTag   string    `json:"asset_tag"`
	BaseURL    string    `json:"base_url"`
	EnrolledAt time.Time `json:"enrolled_at"`
	Version    int       `json:"version"`
}

// Store penyimpan state lokal.
type Store struct {
	path string
	key  []byte // nil = tanpa enkripsi (permission file tetap 0600)
}

// New membangun store. stateKeyHex kosong = tanpa enkripsi AES.
func New(statePath, stateKeyHex string) (*Store, error) {
	if statePath == "" {
		statePath = defaultStatePath()
	}
	if err := os.MkdirAll(filepath.Dir(statePath), 0o700); err != nil {
		return nil, fmt.Errorf("membuat direktori state: %w", err)
	}
	var key []byte
	if stateKeyHex != "" {
		b, err := decodeKeyHex(stateKeyHex)
		if err != nil {
			return nil, err
		}
		key = b
	}
	return &Store{path: statePath, key: key}, nil
}

// decodeKeyHex memvalidasi key AES-256 (32 byte hex).
func decodeKeyHex(hexKey string) ([]byte, error) {
	if len(hexKey) != 64 {
		return nil, errors.New("STATE_KEY_HEX harus 64 karakter hex (32 byte key AES-256-GCM)")
	}
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("STATE_KEY_HEX bukan hex valid: %w", err)
	}
	return key, nil
}

// Save menulis state atomik (tmp → rename), permission 0600.
func (s *Store) Save(_ context.Context, st AgentState) error {
	st.Version = 1
	plain, err := json.Marshal(st)
	if err != nil {
		return fmt.Errorf("serialisasi state: %w", err)
	}
	var payload []byte
	if s.key != nil {
		payload, err = encryptAESGCM(s.key, plain)
		if err != nil {
			return err
		}
	} else {
		payload = plain
	}

	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o600); err != nil {
		return fmt.Errorf("menulis state sementara: %w", err)
	}
	// Pada Windows rename-over-existing tetap aman via os.Rename (MoveFileEx
	// REPLACE_EXISTING); pada Linux chmod tmp sebelum rename.
	if err := os.Chmod(tmp, 0o600); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("chmod state: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename state: %w", err)
	}
	return nil
}

// Load membaca state; ErrNotFound bila file tidak ada.
func (s *Store) Load(_ context.Context) (AgentState, error) {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return AgentState{}, ErrNotFound
		}
		return AgentState{}, fmt.Errorf("membaca state: %w", err)
	}
	plain := raw
	if s.key != nil {
		plain, err = decryptAESGCM(s.key, raw)
		if err != nil {
			return AgentState{}, fmt.Errorf("dekripsi state: %w", err)
		}
	}
	var st AgentState
	if err := json.Unmarshal(plain, &st); err != nil {
		return AgentState{}, fmt.Errorf("state korup: %w", err)
	}
	if st.AgentID == "" || st.HmacSecret == "" {
		return AgentState{}, fmt.Errorf("state tidak lengkap: %w", domain.ErrNotEnrolled)
	}
	return st, nil
}

// encryptAESGCM — AEAD AES-256-GCM, nonce 96-bit acak per enkripsi.
func encryptAESGCM(key, plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("inisialisasi AES: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("inisialisasi GCM: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}
	ct := gcm.Seal(nil, nonce, plain, nil)
	env := struct {
		Version int    `json:"v"`
		Alg     string `json:"alg"`
		Nonce   string `json:"nonce"`
		Data    string `json:"data"`
	}{Version: 1, Alg: "AES-256-GCM", Nonce: base64.StdEncoding.EncodeToString(nonce), Data: base64.StdEncoding.EncodeToString(ct)}
	out, err := json.Marshal(env)
	if err != nil {
		return nil, fmt.Errorf("serialisasi envelope state: %w", err)
	}
	return out, nil
}

// decryptAESGCM — kebalikan encryptAESGCM (tag autentikasi wajib valid).
func decryptAESGCM(key, raw []byte) ([]byte, error) {
	var env struct {
		Version int    `json:"v"`
		Alg     string `json:"alg"`
		Nonce   string `json:"nonce"`
		Data    string `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, fmt.Errorf("envelope state tidak valid: %w", err)
	}
	if env.Alg != "AES-256-GCM" {
		return nil, fmt.Errorf("algoritma state tidak didukung: %s", env.Alg)
	}
	nonce, err := base64.StdEncoding.DecodeString(env.Nonce)
	if err != nil {
		return nil, fmt.Errorf("nonce state tidak valid: %w", err)
	}
	ct, err := base64.StdEncoding.DecodeString(env.Data)
	if err != nil {
		return nil, fmt.Errorf("ciphertext state tidak valid: %w", err)
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
