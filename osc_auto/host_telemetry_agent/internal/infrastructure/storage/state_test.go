package storage

import (
	"bytes"
	"path/filepath"
	"testing"
)

// TestSaveLoadRoundtripPlain — tanpa enkripsi: tulis → baca identik,
// permission file 0600.
func TestSaveLoadRoundtripPlain(t *testing.T) {
	s, err := New(filepath.Join(t.TempDir(), "state.json"), "")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	want := AgentState{AgentID: "agent-1", CompanyID: "co-1", HmacSecret: "sec", NodeType: "HOST", AssetTag: "AG-1"}
	if err := s.Save(testCtx(), want); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := s.Load(testCtx())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.AgentID != want.AgentID || got.HmacSecret != want.HmacSecret || got.CompanyID != want.CompanyID {
		t.Fatalf("roundtrip tidak identik: %+v", got)
	}
}

// TestSaveLoadRoundtripEncrypted — dengan key AES-256-GCM: file di disk
// TIDAK boleh memuat secret plaintext.
func TestSaveLoadRoundtripEncrypted(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	path := filepath.Join(t.TempDir(), "state.json")
	s, err := New(path, key)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	want := AgentState{AgentID: "agent-2", CompanyID: "co-2", HmacSecret: "rahasia-256-bit"}
	if err := s.Save(testCtx(), want); err != nil {
		t.Fatalf("Save: %v", err)
	}
	raw, err := readFileBytes(path)
	if err != nil {
		t.Fatalf("baca file: %v", err)
	}
	if bytes.Contains(raw, []byte("rahasia-256-bit")) {
		t.Fatal("secret plaintext bocor ke disk!")
	}
	got, err := s.Load(testCtx())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.HmacSecret != want.HmacSecret {
		t.Fatalf("dekripsi tidak cocok: %+v", got)
	}
}

// TestLoadMissing — state belum ada → ErrNotFound.
func TestLoadMissing(t *testing.T) {
	s, err := New(filepath.Join(t.TempDir(), "absent.json"), "")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := s.Load(testCtx()); err != ErrNotFound {
		t.Fatalf("harus ErrNotFound, dapat %v", err)
	}
}
