// Package domain — entitas murni dan port (interface) untuk
// host_telemetry_agent. NOL import eksternal: hanya stdlib. Struktur JSON
// mengikuti kontrak osc_docs/rest/contracts/w2.openapi.yaml (snake_case).
package domain

import (
	"context"
	"time"
)

// Inventory — payload POST /api/v1/agents/inventory/ingest
// (osc_docs/rest/contracts/w2.openapi.yaml §InventoryPayload).
type Inventory struct {
	CPUModel          string `json:"cpu_model,omitempty"`
	CPUCores          int    `json:"cpu_cores,omitempty"`
	MemoryTotalBytes  int64  `json:"memory_total_bytes,omitempty"`
	StorageTotalBytes int64  `json:"storage_total_bytes,omitempty"`
	OSName            string `json:"os_name,omitempty"`
	OSVersion         string `json:"os_version,omitempty"`
	Hostname          string `json:"hostname,omitempty"`
	// Payload JSONB bebas (disk, paket, service) — sink generik server.
	Payload map[string]any `json:"payload,omitempty"`
}

// IsZero melaporkan inventaris kosong (tidak layak dikirim).
func (i Inventory) IsZero() bool {
	return i.CPUModel == "" && i.CPUCores == 0 && i.MemoryTotalBytes == 0 &&
		i.StorageTotalBytes == 0 && i.OSName == "" && i.OSVersion == "" &&
		i.Hostname == "" && len(i.Payload) == 0
}

// HostSample — sampel metrik host (kontrak MetricsPayload.host).
// Field nullable dikirim sebagai JSON null bila pointer nil.
type HostSample struct {
	RecordedAt     time.Time `json:"recorded_at"`
	CPUUsagePct    *float64  `json:"cpu_usage_pct"`
	Load1          *float64  `json:"load1"`
	Load5          *float64  `json:"load5"`
	Load15         *float64  `json:"load15"`
	MemUsedBytes   *int64    `json:"mem_used_bytes"`
	MemTotalBytes  *int64    `json:"mem_total_bytes"`
	DiskUsedBytes  *int64    `json:"disk_used_bytes"`
	DiskTotalBytes *int64    `json:"disk_total_bytes"`
	NetInBPS       *int64    `json:"net_in_bps"`
	NetOutBPS      *int64    `json:"net_out_bps"`
	UptimeSeconds  *int64    `json:"uptime_seconds"`
}

// ContainerSample — satu entri kontrak MetricsPayload.containers.
// host_id WAJIB mengacu docker_hosts milik company agent (divalidasi
// server-side; konfigurasi HOST_TELEMETRY_DOCKER_HOST_ID).
type ContainerSample struct {
	HostID        string    `json:"host_id"`
	ContainerRef  string    `json:"container_ref"`
	ContainerName *string   `json:"container_name"`
	RecordedAt    time.Time `json:"recorded_at"`
	CPUUsagePct   *float64  `json:"cpu_usage_pct"`
	MemUsedBytes  *int64    `json:"mem_used_bytes"`
	MemLimitBytes *int64    `json:"mem_limit_bytes"`
	NetInBPS      *int64    `json:"net_in_bps"`
	NetOutBPS     *int64    `json:"net_out_bps"`
	BlockReadBPS  *int64    `json:"block_read_bps"`
	BlockWriteBPS *int64    `json:"block_write_bps"`
	Pids          *int64    `json:"pids"`
	IsRunning     bool      `json:"is_running"`
}

// MetricsBatch — payload POST /api/v1/agents/metrics/ingest. Batas server:
// containers ≤ 200 (dipotong di usecase sebelum kirim).
type MetricsBatch struct {
	Host       *HostSample       `json:"host,omitempty"`
	Containers []ContainerSample `json:"containers,omitempty"`
}

// Credentials — hasil enrollment (respons AgentEnrolled). hmac_secret hanya
// hidup di memori dan state lokal terproteksi; TIDAK PERNAH masuk log.
type Credentials struct {
	AgentID    string `json:"agent_id"`
	CompanyID  string `json:"company_id"`
	HmacSecret string `json:"hmac_secret"`
	NodeType   string `json:"node_type"`
	AssetTag   string `json:"asset_tag"`
}

// EnrollRequest — payload POST /api/v1/agents/enroll (publik, single-use).
type EnrollRequest struct {
	EnrollmentToken string `json:"enrollment_token"`
	Hostname        string `json:"hostname"`
	MgmtIP          string `json:"mgmt_ip,omitempty"`
	AssetModelID    string `json:"asset_model_id"`
	StatusLabelID   string `json:"status_label_id"`
	AssetTag        string `json:"asset_tag,omitempty"`
	AgentVersion    string `json:"agent_version,omitempty"`
}

// SystemCollector — port pengumpul metrik/inventaris OS (diimplementasi
// infrastructure/platform, per-OS via build tag).
type SystemCollector interface {
	// CollectInventory mengumpulkan inventaris hardware/software OS.
	CollectInventory(ctx context.Context) (Inventory, error)
	// CollectHostSample mengambil satu sampel metrik host.
	CollectHostSample(ctx context.Context) (HostSample, error)
}

// DockerStatsCollector — port pengumpul statistik container Docker Engine
// API (unix socket / named pipe). Nil (dinonaktifkan) = dilewati.
type DockerStatsCollector interface {
	CollectContainers(ctx context.Context) ([]ContainerSample, error)
}

// RustAPIClient — port klien osc_rest (diimplementasi
// infrastructure/rustapi; HMAC-SHA256 per-request).
type RustAPIClient interface {
	Enroll(ctx context.Context, req EnrollRequest) (Credentials, error)
	IngestInventory(ctx context.Context, inv Inventory) error
	IngestMetrics(ctx context.Context, batch MetricsBatch) error
	IngestSecurity(ctx context.Context, batch SecurityBatch) error
}
