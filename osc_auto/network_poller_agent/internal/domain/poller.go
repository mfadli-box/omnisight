// Package domain — entitas murni dan port (interface) untuk
// network_poller_agent. NOL import ekstrak stdlib. Struktur JSON mengikuti
// kontrak osc_docs/rest/contracts/w2.openapi.yaml (snake_case).
package domain

import (
	"context"
	"time"
)

// Status probe/heartbeat (kontrak UptimeHeartbeatPayload.status).
const (
	StatusUp   = "UP"
	StatusDown = "DOWN"
)

// Tipe monitor (kontrak MonitorCreate.monitor_type).
const (
	MonitorHTTP    = "HTTP"
	MonitorHTTPS   = "HTTPS"
	MonitorTCP     = "TCP"
	MonitorICMP    = "ICMP"
	MonitorDNS     = "DNS"
	MonitorKeyword = "KEYWORD"
)

// MonitorConfig — definisi satu monitor sintetik (mirror dari entitas
// uptime_monitors yang dibuat admin via JWT API; file lokal berperan
// sebagai daftar tugas polling agent).
type MonitorConfig struct {
	MonitorID string `json:"monitor_id"`
	Type      string `json:"type"`
	Target    string `json:"target"`
	// Keyword wajib bila Type == KEYWORD.
	Keyword string `json:"keyword,omitempty"`
	// TimeoutSeconds opsional per monitor (default global agent).
	TimeoutSeconds int `json:"timeout_seconds,omitempty"`
}

// SnmpInterface — pemetaan interface perangkat SNMP (interface_id =
// uuid device_interfaces milik company agent).
type SnmpInterface struct {
	InterfaceID string `json:"interface_id"`
	IfIndex     int    `json:"if_index"`
	Name        string `json:"name,omitempty"`
}

// SnmpDevice — kredensial polling satu perangkat SNMPv2c (community
// dibaca dari file konfigurasi 0600 — tidak pernah di-log).
type SnmpDevice struct {
	Host       string          `json:"host"`
	Community  string          `json:"community"`
	Interfaces []SnmpInterface `json:"interfaces"`
}

// MonitorsFile — bentuk file konfigurasi monitoring agent.
type MonitorsFile struct {
	Monitors    []MonitorConfig `json:"monitors"`
	SnmpDevices []SnmpDevice    `json:"snmp_devices"`
}

// ProbeResult — hasil satu eksekusi probe.
type ProbeResult struct {
	Status string // UP | DOWN
	PingMS *int64
	Msg    string
}

// HeartbeatPayload — payload POST /api/v1/agents/uptime/ingest.
type HeartbeatPayload struct {
	MonitorID  string    `json:"monitor_id"`
	Status     string    `json:"status"`
	PingMS     *int64    `json:"ping_ms"`
	Msg        *string   `json:"msg"`
	RecordedAt time.Time `json:"recorded_at"`
}

// SnmpInterfaceSample — entri kontrak MetricsPayload.snmp_interfaces.
type SnmpInterfaceSample struct {
	InterfaceID string    `json:"interface_id"`
	CollectedAt time.Time `json:"collected_at"`
	InOctets    uint64    `json:"in_octets"`
	OutOctets   uint64    `json:"out_octets"`
	InErrors    *int64    `json:"in_errors"`
	OutErrors   *int64    `json:"out_errors"`
	InDiscards  *int64    `json:"in_discards"`
	OutDiscards *int64    `json:"out_discards"`
	InRateBPS   *int64    `json:"in_rate_bps"`
	OutRateBPS  *int64    `json:"out_rate_bps"`
}

// MetricsBatch — payload POST /api/v1/agents/metrics/ingest (agent ini
// hanya memakai snmp_interfaces; batas server 500 entri).
type MetricsBatch struct {
	SnmpInterfaces []SnmpInterfaceSample `json:"snmp_interfaces"`
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

// Prober — port eksekusi probe sintetik (diimplementasi infrastructure/probes).
type Prober interface {
	Probe(ctx context.Context, m MonitorConfig) ProbeResult
}

// IfCounters — counter SNMP satu interface (nil pointer = OID tidak tersedia).
type IfCounters struct {
	InOctets    *uint64
	OutOctets   *uint64
	InErrors    *uint64
	OutErrors   *uint64
	InDiscards  *uint64
	OutDiscards *uint64
}

// SNMPClient — port polling counter SNMP (infrastructure/snmp).
type SNMPClient interface {
	// FetchCounters mengambil counter interface yang dipetakan untuk device.
	FetchCounters(ctx context.Context, dev SnmpDevice) (map[int]IfCounters, error)
}

// ConfigSource — port pembaca file konfigurasi monitoring (storage).
type ConfigSource interface {
	// Load membaca daftar monitor/device (hot-reload tiap siklus).
	Load(ctx context.Context) (MonitorsFile, error)
}

// RustAPIClient — port klien osc_rest (infrastructure/rustapi; HMAC).
type RustAPIClient interface {
	Enroll(ctx context.Context, req EnrollRequest) (Credentials, error)
	IngestHeartbeat(ctx context.Context, hb HeartbeatPayload) error
	IngestMetrics(ctx context.Context, batch MetricsBatch) error
}
