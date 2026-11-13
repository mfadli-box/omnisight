// Package domain — entitas murni dan port (interface) untuk
// infra_control_agent. NOL import eksternal selain stdlib. Bentuk payload
// mengikuti entitas kontrak osc_docs/rest/contracts/w2.openapi.yaml
// (command enum `up|down|pull|restart` untuk docker stack dan
// `test_reload` untuk nginx vhost — agent-plane API dijelaskan di README).
package domain

import (
	"context"
	"time"
)

// Jenis dispatch (mirror status pipeline docker_stacks & nginx_virtual_hosts).
const (
	DispatchKindDockerStack = "docker_stack"
	DispatchKindNginxVhost  = "nginx_vhost"
)

// Command enum (allowlist ketat — mirror validator app-level osc_rest).
const (
	CmdUp         = "up"
	CmdDown       = "down"
	CmdPull       = "pull"
	CmdRestart    = "restart"
	CmdTestReload = "test_reload"
)

// Status ack agent (memutakhirkan stack/vhost di server).
const (
	StatusApplied    = "APPLIED"
	StatusFailed     = "FAILED"
	StatusRolledBack = "ROLLED_BACK"
)

// StackDispatch — job docker compose stack.
type StackDispatch struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	WorkingDir     string `json:"working_dir"`
	ComposeContent string `json:"compose_content"`
	Env            string `json:"env,omitempty"`
}

// VhostDispatch — job nginx virtual host.
type VhostDispatch struct {
	ID            string `json:"id"`
	ServerName    string `json:"server_name"`
	ListenPort    int    `json:"listen_port"`
	ConfigContent string `json:"config_content"`
	SSLCertPath   string `json:"ssl_cert_path,omitempty"`
	SSLKeyPath    string `json:"ssl_key_path,omitempty"`
}

// Dispatch — satu job antrean dari outbox osc_rest.
type Dispatch struct {
	DispatchRef string         `json:"dispatch_ref"`
	Kind        string         `json:"kind"`
	Command     string         `json:"command"`
	Stack       *StackDispatch `json:"stack,omitempty"`
	Vhost       *VhostDispatch `json:"vhost,omitempty"`
}

// AckResult — hasil eksekusi yang dilaporkan ke osc_rest.
type AckResult struct {
	DispatchRef string    `json:"dispatch_ref"`
	Status      string    // APPLIED | FAILED | ROLLED_BACK
	LastError   string    `json:"last_error,omitempty"`
	At          time.Time `json:"at"`
}

// LogPublish — push baris log live (POST /api/v1/agents/logs).
type LogPublish struct {
	Scope     string   `json:"scope"` // docker_stack | nginx_vhost
	Reference string   `json:"reference"`
	Source    string   `json:"source,omitempty"` // default agent
	Level     string   `json:"level,omitempty"`  // DEBUG|INFO|WARN|ERROR
	Lines     []string `json:"lines"`
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

// DispatchSource — port pengambil antrean outbox (rustapi).
type DispatchSource interface {
	FetchPending(ctx context.Context) ([]Dispatch, error)
}

// AckSink — port pelaporan hasil eksekusi (rustapi).
type AckSink interface {
	Ack(ctx context.Context, result AckResult) error
}

// LogPublisher — port push log live (rustapi).
type LogPublisher interface {
	Publish(ctx context.Context, lp LogPublish) error
}

// CommandRunner — port eksekusi proses (execrunner). Nama binary + argumen
// eksplisit — TANPA shell, TANPA string concatenation dari input klien.
type CommandRunner interface {
	// Run menjalankan binary dengan args di dir, batas timeout;
	// mengembalikan output gabungan (bounded) — error berisi exit status.
	Run(ctx context.Context, name string, args []string, dir string, timeout time.Duration) (string, error)
}

// FileSystem — port penulisan file terkontrol (untuk unit-test dispatcher).
type FileSystem interface {
	// ReadFile membaca file target (rollback memerlukan konten lama).
	ReadFile(path string) ([]byte, error)
	// WriteFileAtomic menulis file atomik (tmp → rename) dengan mode ketat.
	WriteFileAtomic(path string, data []byte, mode uint32) error
	// MkdirAll membuat direktori (semua level) dengan mode ketat.
	MkdirAll(path string, mode uint32) error
	// EvalSymlinks me-resolve path (deteksi symlink escape).
	EvalSymlinks(path string) (string, error)
	// Exists menguji keberadaan path.
	Exists(path string) bool
	// RemoveFile menghapus file (rollback vhost tanpa config lama).
	RemoveFile(path string) error
}
