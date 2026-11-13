// Package domain — entitas File Integrity Monitoring (FIM) murni.
// Struktur JSON mengikuti kontrak osc_docs/rest/contracts/w3.openapi.yaml
// (§FimEventIn, field snake_case). Batch FIM dikirim via
// POST /api/v1/agents/security/ingest (HMAC agent).
package domain

import (
	"context"
	"regexp"
	"time"
)

// FIM enum kontrak — dipakai apa adanya agar CAST enum server cocok.
const (
	FimEventCreated          = "CREATED"
	FimEventModified         = "MODIFIED"
	FimEventDeleted          = "DELETED"
	FimEventAttributeChanged = "ATTRIBUTE_CHANGED"

	FimSourceRealtime  = "REALTIME"
	FimSourceScheduled = "SCHEDULED"
)

// sha256Hex64 pola checksum kontrak (hex-64).
var sha256Hex64 = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

// FimAttrs — atribut lama/baru (JSONB old_attrs/new_attrs kontrak).
type FimAttrs struct {
	Mode  string `json:"mode"`  // "-rw-r--r--" / "-rw-------"
	UID   int    `json:"uid"`   // Windows: selalu 0 (tidak berlaku)
	GID   int    `json:"gid"`   // Windows: selalu 0
	MTime string `json:"mtime"` // RFC3339
	Size  int64  `json:"size"`
}

// FimEvent — satu entri kontrak FimEventIn.
type FimEvent struct {
	AssetID         string    `json:"asset_id,omitempty"` // wajib = agent pelapor bila diisi (biarkan kosong)
	Path            string    `json:"path"`
	EventType       string    `json:"event_type"`
	DetectionSource string    `json:"detection_source,omitempty"` // default SCHEDULED
	BaselineVersion int       `json:"baseline_version,omitempty"` // default 1
	OldChecksum     string    `json:"old_checksum,omitempty"`     // sha256 hex-64
	NewChecksum     string    `json:"new_checksum,omitempty"`
	OldAttrs        *FimAttrs `json:"old_attrs,omitempty"`
	NewAttrs        *FimAttrs `json:"new_attrs,omitempty"`
	SizeBytes       int64     `json:"size_bytes,omitempty"`
	DetectedAt      time.Time `json:"detected_at"`
}

// Validate memeriksa invariant kontrak sebelum ingest (anti 400 VALIDATION_ERROR).
func (e FimEvent) Validate() error {
	if e.Path == "" || len(e.Path) > 1000 {
		return ErrInvalidEvent
	}
	switch e.EventType {
	case FimEventCreated, FimEventModified, FimEventDeleted, FimEventAttributeChanged:
	default:
		return ErrInvalidEvent
	}
	for _, cs := range []string{e.OldChecksum, e.NewChecksum} {
		if cs != "" && !sha256Hex64.MatchString(cs) {
			return ErrInvalidEvent
		}
	}
	return nil
}

// FimBaselineEntry — satu baris baseline lokal (checksum + atribut).
type FimBaselineEntry struct {
	Checksum string   `json:"checksum"`
	Attrs    FimAttrs `json:"attrs"`
}

// FimBaseline — peta path → entri baseline. Disimpan lokal (0600,
// opsional AES-256-GCM) supaya scan berikutnya cukup diff — ringan.
type FimBaseline struct {
	Version  int                          `json:"version"`
	Scanned  time.Time                    `json:"scanned_at"`
	Entries  map[string]FimBaselineEntry  `json:"entries"`
}

// SecurityBatch — payload POST /api/v1/agents/security/ingest.
// Batas kontrak: fim_events ≤ 500 (field lain tidak dipakai agent ini).
type SecurityBatch struct {
	FimEvents []FimEvent `json:"fim_events,omitempty"`
}

// FimCollector — port pemantau integritas file (diimplementasi
// infrastructure/platform; SCHEDULED checksum scan, dual-mode real-time
// diserahkan kontrak tapi agent ini sengaja ringan tanpa inotify).
type FimCollector interface {
	// CollectChanges membandingkan state disk saat ini dengan baseline
	// lokal, mengembalikan daftar event perubahan, lalu memutakhirkan
	// baseline. Kolektor thread-safe (dipanggil dari loop tunggal).
	CollectChanges(ctx context.Context) ([]FimEvent, error)
}
