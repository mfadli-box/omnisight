//go:build linux

package platform

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/infrastructure/storage"
)

func testFimStore(t *testing.T) *storage.Store {
	t.Helper()
	dir := t.TempDir()
	s, err := storage.New(filepath.Join(dir, "state.json"), "")
	if err != nil {
		t.Fatalf("storage.New: %v", err)
	}
	return s
}

func TestFimScannerDetectsCreateModifyDelete(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "nginx.conf")
	if err := os.WriteFile(file, []byte("user nginx;\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := NewFimScanner([]string{root}, testFimStore(t), silentLogger())

	// Scan 1: baseline kosong → semua CREATED (root + isi).
	events, err := s.CollectChanges(context.Background())
	if err != nil {
		t.Fatalf("scan 1: %v", err)
	}
	var fileEvt *domain.FimEvent
	for i := range events {
		if events[i].Path == file {
			fileEvt = &events[i]
			break
		}
	}
	if fileEvt == nil || fileEvt.EventType != "CREATED" {
		t.Fatalf("file harus CREATED, dapat %+v", events)
	}
	if len(fileEvt.NewChecksum) != 64 {
		t.Fatalf("checksum harus hex-64, dapat %q", fileEvt.NewChecksum)
	}
	if fileEvt.DetectionSource != "SCHEDULED" {
		t.Fatalf("detection_source harus SCHEDULED: %q", fileEvt.DetectionSource)
	}

	// Scan 2: tidak ada perubahan → tanpa event.
	if events, err = s.CollectChanges(context.Background()); err != nil || len(events) != 0 {
		t.Fatalf("scan stabil harus tanpa event, dapat %v err=%v", events, err)
	}

	// Scan 3: konten berubah → MODIFIED dengan old+new checksum.
	if err := os.WriteFile(file, []byte("user root;\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if events, err = s.CollectChanges(context.Background()); err != nil {
		t.Fatalf("scan 3: %v", err)
	}
	if len(events) != 1 || events[0].EventType != "MODIFIED" ||
		len(events[0].OldChecksum) != 64 || len(events[0].NewChecksum) != 64 {
		t.Fatalf("harus MODIFIED dengan old/new checksum: %+v", events)
	}

	// Scan 4: hanya permission berubah → ATTRIBUTE_CHANGED (checksum sama).
	if err := os.Chmod(file, 0o600); err != nil {
		t.Fatal(err)
	}
	if events, err = s.CollectChanges(context.Background()); err != nil {
		t.Fatalf("scan 4: %v", err)
	}
	if len(events) != 1 || events[0].EventType != "ATTRIBUTE_CHANGED" {
		t.Fatalf("harus ATTRIBUTE_CHANGED: %+v", events)
	}

	// Scan 5: file dihapus → DELETED dengan old checksum.
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	if events, err = s.CollectChanges(context.Background()); err != nil {
		t.Fatalf("scan 5: %v", err)
	}
	var del *domain.FimEvent
	for i := range events {
		if events[i].Path == file {
			del = &events[i]
		}
	}
	if del == nil || del.EventType != "DELETED" || del.OldChecksum == "" {
		t.Fatalf("file harus DELETED: %+v", events)
	}
}

func TestFimScannerSkipsSymlinkEscapingRoot(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	outsideFile := filepath.Join(outside, "secret")
	if err := os.WriteFile(outsideFile, []byte("rahasia"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsideFile, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	s := NewFimScanner([]string{root}, testFimStore(t), silentLogger())
	events, err := s.CollectChanges(context.Background())
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	// Symlink ditangani atribut-saja via Lstat — tidak boleh ada event
	// yang mengunggah isi/checksum file target di luar root.
	for _, e := range events {
		if e.NewChecksum != "" {
			t.Fatalf("symlink tidak boleh punya checksum (konten bocor): %+v", e)
		}
		if filepath.Base(e.Path) == "secret" {
			t.Fatalf("file target symlink tidak boleh dimasukkan baseline: %+v", e)
		}
	}
}

func TestFimScannerRelativePathRejected(t *testing.T) {
	s := NewFimScanner([]string{"relative/path"}, testFimStore(t), silentLogger())
	if len(s.paths) != 0 {
		t.Fatalf("path relatif harus ditolak, dapat %v", s.paths)
	}
}

func TestFimBaselinePersistsAcrossScanners(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "a.conf"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := testFimStore(t)
	s1 := NewFimScanner([]string{root}, store, silentLogger())
	if _, err := s1.CollectChanges(context.Background()); err != nil {
		t.Fatalf("scan scanner-1: %v", err)
	}
	// Scanner baru (proses restart) memuat baseline yang sama → tanpa event.
	s2 := NewFimScanner([]string{root}, store, silentLogger())
	events, err := s2.CollectChanges(context.Background())
	if err != nil {
		t.Fatalf("scan scanner-2: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("baseline harus bertahan antar scanner, dapat %+v", events)
	}
}

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError}))
}
