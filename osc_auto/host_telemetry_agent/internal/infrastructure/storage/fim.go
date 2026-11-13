// Persistensi baseline FIM (file <state_dir>/fim_baseline.json — 0600,
// opsional terenkripsi AES-256-GCM bila STATE_KEY_HEX diset; memakai
// helper enkripsi yang sama dengan state kredensial).
package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
)

// FimBaselinePath mengembalikan path file baseline FIM (satu dir dengan state).
func (s *Store) FimBaselinePath() string {
	return filepath.Join(filepath.Dir(s.path), "fim_baseline.json")
}

// SaveFimBaseline menulis baseline atomik (tmp → chmod 0600 → rename).
func (s *Store) SaveFimBaseline(_ context.Context, b *domain.FimBaseline) error {
	if b.Entries == nil {
		b.Entries = map[string]domain.FimBaselineEntry{}
	}
	b.Version = 1
	plain, err := json.Marshal(b)
	if err != nil {
		return fmt.Errorf("serialisasi baseline FIM: %w", err)
	}
	payload := plain
	if s.key != nil {
		if payload, err = encryptAESGCM(s.key, plain); err != nil {
			return err
		}
	}
	path := s.FimBaselinePath()
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o600); err != nil {
		return fmt.Errorf("menulis baseline sementara: %w", err)
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("chmod baseline: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename baseline: %w", err)
	}
	return nil
}

// LoadFimBaseline membaca baseline; ErrNotFound bila belum ada (scan pertama
// → semua entri menjadi CREATED). Baseline > 30 hari dianggap kadaluarsa
// (diskip → scan pertama membangun ulang baseline segar).
func (s *Store) LoadFimBaseline(_ context.Context) (*domain.FimBaseline, error) {
	raw, err := os.ReadFile(s.FimBaselinePath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("membaca baseline FIM: %w", err)
	}
	plain := raw
	if s.key != nil {
		if plain, err = decryptAESGCM(s.key, raw); err != nil {
			return nil, fmt.Errorf("dekripsi baseline FIM: %w", err)
		}
	}
	var b domain.FimBaseline
	if err := json.Unmarshal(plain, &b); err != nil {
		return nil, fmt.Errorf("baseline FIM korup: %w", err)
	}
	if time.Since(b.Scanned) > 30*24*time.Hour {
		return nil, ErrNotFound
	}
	return &b, nil
}
