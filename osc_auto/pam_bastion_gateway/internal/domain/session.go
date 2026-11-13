// Package domain — entitas murni & port untuk pam_bastion_gateway.
// NOL import eksternal: hanya stdlib. Struktur JSON mengikuti kontrak
// osc_docs/rest/contracts/w3.openapi.yaml (§PamRedeemResult, §PamRecordingResult).
package domain

import (
	"context"
	"time"
)

// Enum kontrak W3.
const (
	AccountSSHPassword = "SSH_PASSWORD"
	AccountSSHKey      = "SSH_KEY"
	AccountDatabase    = "DATABASE"
	AccountHTTPEndpint = "HTTP_ENDPOINT"
)

// RecordingFormat — query ?format= (default CAST_GZ).
const RecordingFormatCastGZ = "CAST_GZ"

// TargetInfo — §PamRedeemResult.target (kredensial TIDAK termasuk struct ini).
type TargetInfo struct {
	AssetID   string `json:"asset_id"`
	AssetName string `json:"asset_name"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
}

// AccountInfo — §PamRedeemResult.account (tanpa secret).
type AccountInfo struct {
	Username    string `json:"username"`
	AccountType string `json:"account_type"`
}

// CommandFilter — policy.command_filter (deny/confirm/allow, JumpServer-style).
// Gateway menegakkan DENY real-time; CONFIRM dianggap butuh approval W4
// → ditolak deny-by-default; ALLOW reserved untuk audit.
type CommandFilter struct {
	Deny    []string `json:"deny"`
	Confirm []string `json:"confirm"`
	Allow   []string `json:"allow"`
}

// PolicyInfo — §PamRedeemResult.policy.
type PolicyInfo struct {
	CommandFilter     *CommandFilter `json:"command_filter"`
	MaxSessionMinutes int            `json:"max_session_minutes"`
}

// RedeemTicketRequest — POST /api/v1/agents/pam/ticket/redeem.
type RedeemTicketRequest struct {
	SessionID string `json:"session_id"`
	Ticket    string `json:"ticket"`
}

// RedeemSecret — plaintext secret target. Disimpan sebagai []byte agar
// dapat di-zero-ize (memori) setelah auth SSH; TIDAK PERNAH masuk log
// maupun frame WebSocket ke browser.
type RedeemSecret struct {
	Username    string
	AccountType string
	Secret      []byte
}

// RedeemResult — hasil redeem sukses (data internal gateway).
type RedeemResult struct {
	SessionID string
	Target    TargetInfo
	Account   RedeemSecret
	Policy    PolicyInfo
}

// RecordingResult — §PamRecordingResult (respons upload rekaman).
type RecordingResult struct {
	SessionID string `json:"session_id"`
	FileID    string `json:"file_id"`
	Bucket    string `json:"bucket"`
	ObjectKey string `json:"object_key"`
	SizeBytes int64  `json:"size_bytes"`
	SHA256    string `json:"sha256"`
}

// TerminalStream — port frame WebSocket dua arah ke browser (diimplementasi
// infrastructure/wsserver; interface disengaja kompatibel gorilla/websocket
// tanpa mengimpor library di layer dalam).
type TerminalStream interface {
	// ReadMessage mengembalikan (messageType, data, err).
	ReadMessage() (int, []byte, error)
	// WriteMessage mengirim frame (binary = terminal bytes, text = event JSON).
	WriteMessage(messageType int, data []byte) error
	// SetReadDeadline mengatur deadline baca (handshake timeout); time.Time{}
	// menghapus deadline.
	SetReadDeadline(t time.Time) error
	// Close menutup koneksi browser.
	Close() error
}

// SSHClient — port sesi SSH ke target (diimplementasi infrastructure/ssh).
type SSHClient interface {
	// OpenPTY meminta pty+shell dan mengembalikan saluran interaksi.
	// rows/cols mengikuti browser (default 24x80).
	OpenPTY(rows, cols int, term string) (ShellSession, error)
	// Close memutus koneksi SSH.
	Close() error
}

// ShellSession — stdin/stdout/resize sesi shell yang sudah jalan.
type ShellSession interface {
	// StdinWrite menulis byte mentah ke stdin remote (sudah lolos ACL).
	StdinWrite(p []byte) error
	// StdoutPipe mengembalikan channel output remote (diproduksi sampai
	// session berakhir; channel ditutup otomatis saat selesai).
	StdoutPipe() <-chan []byte
	// Resize mengubah dimensi PTY.
	Resize(rows, cols int) error
	// ExitCode mengembalikan status exit sesi (-1 bila belum selesai).
	ExitCode() int
	// Close menutup sesi shell.
	Close() error
}

// SSHDialer — port pembuka koneksi SSH (diimplementasi infrastructure/ssh).
type SSHDialer interface {
	// Dial melakukan koneksi+auth+known_hosts TOFU ke target.
	Dial(ctx context.Context, target TargetInfo, account RedeemSecret) (SSHClient, error)
}

// RustAPIClient — port klien osc_rest (diimplementasi
// infrastructure/rustapi; HMAC-SHA256 per-request).
type RustAPIClient interface {
	Enroll(ctx context.Context, req EnrollRequest) (Credentials, error)
	RedeemTicket(ctx context.Context, req RedeemTicketRequest) (RedeemResult, error)
	UploadRecording(ctx context.Context, sessionID string, format string, body []byte) (RecordingResult, error)
}

// EnrollRequest / Credentials — identik pola enrollment agent W2
// (POST /api/v1/agents/enroll publik; kredensial disimpan state 0600).
type EnrollRequest struct {
	EnrollmentToken string `json:"enrollment_token"`
	Hostname        string `json:"hostname"`
	MgmtIP          string `json:"mgmt_ip,omitempty"`
	AssetModelID    string `json:"asset_model_id"`
	StatusLabelID   string `json:"status_label_id"`
	AssetTag        string `json:"asset_tag,omitempty"`
	AgentVersion    string `json:"agent_version,omitempty"`
}

type Credentials struct {
	AgentID    string `json:"agent_id"`
	CompanyID  string `json:"company_id"`
	HmacSecret string `json:"hmac_secret"`
	NodeType   string `json:"node_type"`
	AssetTag   string `json:"asset_tag"`
}

// BlockNotice — pesan yang ditampilkan ke browser saat perintah diblokir
// ACL (teks terminal; bukan secret).
func BlockNotice(cmd string) []byte {
	return []byte("\r\n\x1b[31m[OMNISIGHT PAM] Perintah DIBLOKIR oleh Command ACL policy:\r\n  " + cmd + "\x1b[0m\r\n")
}

// Notice digunakan untuk pesan info non-output (mis. recording mulai).
func Notice(msg string) []byte {
	return []byte("\r\n\x1b[36m[OMNISIGHT PAM] " + msg + "\x1b[0m\r\n")
}

// SessionDeadline mengembalikan batas sesi dari policy (cap absolut
// 480 menit sesuai kontrak authorize; 0/nonpositif → default 120 mnt).
func (p PolicyInfo) SessionDeadline() time.Duration {
	minutes := p.MaxSessionMinutes
	if minutes <= 0 {
		minutes = 120
	}
	if minutes > 480 {
		minutes = 480
	}
	return time.Duration(minutes) * time.Minute
}
