// Package platform — File Integrity Monitoring (FIM) ringan, lintas-OS.
//
// Desain ("ringan" sesuai permintaan Hari 17 / SESI 4.2):
//   - SCHEDULED checksum scan (bukan inotify/fsmon) — satu goroutine,
//     tanpa syscall khusus kernel, memakai stdlib os.Lstat + sha256.
//   - Baseline hash+atribut dipersist lokal (storage.FimStore) sehingga
//     scan berikutnya hanya diff — biaya CPU konstan kecil.
//   - Hanya file reguler ≤ maxHashSize di-hash; symlink TIDAK diikuti
//     (anti traversal/loop); direktori dicek atributnya saja.
//   - Windows: uid/gid selalu 0; mode dari Go FileMode (dibaca lintas-OS).
package platform

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/infrastructure/storage"
)

const (
	// maxHashSize — file lebih besar dari ini tidak di-hash (hanya
	// atribut) supaya scan tetap ringan; log FimSizeBytes tetap terkirim.
	maxHashSize = 32 << 20 // 32 MiB
	// maxEventsPerScan — batas keamanan memori; sisanya diskip siklus ini.
	maxEventsPerScan = 1000
	// maxDepth — batas kedalaman rekursi per root path.
	maxDepth = 8
)

// FimScanner — kolektor FIM SCHEDULED (implementasi domain.FimCollector).
type FimScanner struct {
	paths   []string
	version int
	store   *storage.Store
	logger  *slog.Logger
}

// NewFimScanner membangun scanner. paths kosong → default per-OS
// (defaultFimPaths, lihat fim_linux.go / fim_windows.go). Baseline
// dimuat dari store; versi baseline dinaikkan setiap scan penuh.
func NewFimScanner(paths []string, store *storage.Store, logger *slog.Logger) *FimScanner {
	if len(paths) == 0 {
		paths = defaultFimPaths()
	}
	// Normalisasi + buang duplikat + path traversal-safe (absolut saja).
	seen := make(map[string]struct{}, len(paths))
	cleaned := make([]string, 0, len(paths))
	for _, p := range paths {
		p = filepath.Clean(p)
		if !filepath.IsAbs(p) {
			logger.Warn("path FIM relatif diabaikan (wajib absolut)", "path", p)
			continue
		}
		if _, dup := seen[p]; dup {
			continue
		}
		seen[p] = struct{}{}
		cleaned = append(cleaned, p)
	}
	return &FimScanner{paths: cleaned, version: 1, store: store, logger: logger}
}

// CollectChanges mengeksekusi satu scan SCHEDULED: diff baseline vs disk,
// mengembalikan event (maks maxEventsPerScan), lalu menyimpan baseline
// baru. Error per-file non-fatal (file hilang saat dibaca → DELETED).
func (s *FimScanner) CollectChanges(ctx context.Context) ([]domain.FimEvent, error) {
	baseline, err := s.store.LoadFimBaseline(ctx)
	switch {
	case err == storage.ErrNotFound:
		baseline = &domain.FimBaseline{}
	case err != nil:
		return nil, fmt.Errorf("memuat baseline FIM: %w", err)
	}
	if baseline.Entries == nil {
		baseline.Entries = map[string]domain.FimBaselineEntry{}
	}

	events := make([]domain.FimEvent, 0)
	now := map[string]domain.FimBaselineEntry{}
	var paths []string

	for _, root := range s.paths {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		info, err := os.Lstat(root)
		if err != nil {
			s.logger.Warn("root FIM tidak dapat diakses", "path", root, "err", err.Error())
			continue
		}
		paths = append(paths, root)
		if info.IsDir() {
			// Rekursi terbatas; root sendiri sudah ditambahkan di atas —
			// WalkDir melewati root agar tidak dobel dalam baseline.
			err = filepath.WalkDir(root, func(p string, d os.DirEntry, walkErr error) error {
				if p == root {
					return nil
				}
				if walkErr != nil {
					s.logger.Debug("entri FIM dilewati", "path", p, "err", walkErr.Error())
					return nil // non-fatal: entri bermasalah di-skip
				}
				if p != root && d.IsDir() && depthOf(root, p) > maxDepth {
					return filepath.SkipAll
				}
				paths = append(paths, p)
				return nil
			})
			if err != nil {
				s.logger.Warn("walk root FIM gagal sebagian", "path", root, "err", err.Error())
			}
		}
	}

	for _, p := range paths {
		entry, evt, ok := s.statEntry(p, baseline)
		if ok {
			now[p] = entry
		}
		if evt != nil {
			if len(events) >= maxEventsPerScan {
				s.logger.Warn("batas event FIM per scan tercapai — sisanya diskip",
					"limit", maxEventsPerScan)
				break
			}
			events = append(events, *evt)
		}
	}

	// Path yang hilang dari disk → DELETED (kecuali root yang gagal stat).
	for path, old := range baseline.Entries {
		if _, stillThere := now[path]; !stillThere && isUnderRoots(path, s.paths) {
			if len(events) >= maxEventsPerScan {
				break
			}
			events = append(events, domain.FimEvent{
				Path:            path,
				EventType:       domain.FimEventDeleted,
				DetectionSource: domain.FimSourceScheduled,
				BaselineVersion: s.version,
				OldChecksum:     old.Checksum,
				OldAttrs:        &old.Attrs,
				DetectedAt:      time.Now().UTC(),
			})
		}
	}

	baseline = &domain.FimBaseline{
		Version: s.version,
		Scanned: time.Now().UTC(),
		Entries: now,
	}
	if err := s.store.SaveFimBaseline(ctx, baseline); err != nil {
		// Event tetap dikirim walau baseline gagal disimpan (scan berikutnya
		// akan mendeteksi ulang — aman, hanya duplikasi potensial).
		s.logger.Error("menyimpan baseline FIM gagal", "err", err.Error())
	}
	return events, nil
}

// statEntry menghitung entri baseline + event diff untuk satu path.
func (s *FimScanner) statEntry(p string, baseline *domain.FimBaseline) (domain.FimBaselineEntry, *domain.FimEvent, bool) {
	info, err := os.Lstat(p)
	if err != nil {
		return domain.FimBaselineEntry{}, nil, false
	}
	attrs := fimAttrs(info)

	// Symlink & non-reguler: atribut saja, tanpa checksum.
	var sum string
	if info.Mode().IsRegular() && info.Size() <= maxHashSize {
		sum, err = fileChecksum(p)
		if err != nil {
			s.logger.Debug("checksum FIM gagal (atribut saja)", "path", p, "err", err.Error())
		}
	}

	entry := domain.FimBaselineEntry{Checksum: sum, Attrs: attrs}
	old, hadOld := baseline.Entries[p]
	if !hadOld {
		return entry, s.event(domain.FimEventCreated, p, nil, entry), true
	}

	if old.Checksum != sum {
		return entry, s.event(domain.FimEventModified, p, &old, entry), true
	}
	if !attrsEqual(old.Attrs, attrs) {
		return entry, s.event(domain.FimEventAttributeChanged, p, &old, entry), true
	}
	return entry, nil, true
}

// event membangun FimEvent dengan metadata scan standar.
func (s *FimScanner) event(kind, path string, old *domain.FimBaselineEntry, new domain.FimBaselineEntry) *domain.FimEvent {
	evt := domain.FimEvent{
		Path:            path,
		EventType:       kind,
		DetectionSource: domain.FimSourceScheduled,
		BaselineVersion: s.version,
		NewChecksum:     new.Checksum,
		NewAttrs:        &new.Attrs,
		SizeBytes:       new.Attrs.Size,
		DetectedAt:      time.Now().UTC(),
	}
	if old != nil {
		evt.OldChecksum = old.Checksum
		evt.OldAttrs = &old.Attrs
	}
	return &evt
}

// fileChecksum — SHA-256 hex isi file (streaming, bounded stat size).
func fileChecksum(path string) (string, error) {
	f, err := os.Open(path) // #nosec G304 — path hasil walkDir terkontrol
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// fimAttrs memetakan FileInfo → atribut JSONB kontrak (mode/uid/gid/mtime/size).
func fimAttrs(info os.FileInfo) domain.FimAttrs {
	return domain.FimAttrs{
		Mode:  info.Mode().String(),
		UID:   uidOf(info),
		GID:   gidOf(info),
		MTime: info.ModTime().UTC().Format(time.RFC3339Nano),
		Size:  info.Size(),
	}
}

func attrsEqual(a, b domain.FimAttrs) bool {
	return a.Mode == b.Mode && a.UID == b.UID && a.GID == b.GID &&
		a.MTime == b.MTime && a.Size == b.Size
}

// depthOf menghitung kedalaman relasi p terhadap root (filepath.Rel aman).
func depthOf(root, p string) int {
	rel, err := filepath.Rel(root, p)
	if err != nil {
		return maxDepth + 1
	}
	return strings.Count(rel, string(os.PathSeparator)) + 1
}

// isUnderRoots mengecek path berada di bawah salah satu root terpantau
// (anti false-DELETED untuk file di luar scope).
func isUnderRoots(path string, roots []string) bool {
	for _, root := range roots {
		rel, err := filepath.Rel(root, path)
		if err == nil && !strings.HasPrefix(rel, "..") {
			return true
		}
	}
	return false
}
