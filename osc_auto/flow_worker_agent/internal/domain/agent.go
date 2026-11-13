// Package domain — entitas enrollment & kredensial agent (pola W2/W3).
package domain

import "time"

// EnrollRequest — payload POST /api/v1/agents/enroll (kontrak w2.openapi.yaml).
type EnrollRequest struct {
	EnrollmentToken string `json:"enrollment_token"`
	Hostname        string `json:"hostname"`
	MgmtIP          string `json:"mgmt_ip,omitempty"`
	AssetModelID    string `json:"asset_model_id"`
	StatusLabelID   string `json:"status_label_id"`
	AssetTag        string `json:"asset_tag,omitempty"`
	AgentVersion    string `json:"agent_version"`
}

// Credentials — respons enroll (hmac_secret hanya dikirim SEKALI server).
type Credentials struct {
	AgentID    string `json:"agent_id"`
	CompanyID  string `json:"company_id"`
	HmacSecret string `json:"hmac_secret"`
	NodeType   string `json:"node_type"`
	AssetTag   string `json:"asset_tag"`
}

// EnrollResponse — bentuk data envelope respons server.
type EnrollResponse struct {
	AgentID    string `json:"agent_id"`
	CompanyID  string `json:"company_id"`
	HmacSecret string `json:"hmac_secret"`
	NodeType   string `json:"node_type"`
	AssetTag   string `json:"asset_tag"`
}

// RetentionResult — hasil purge (kontrak w3: data.purged per tabel).
type RetentionResult struct {
	DryRun bool             `json:"dry_run"`
	Purged map[string]int64 `json:"purged"`
}

// Now — jam domain (di-inject agar test deterministik).
type Now func() time.Time
