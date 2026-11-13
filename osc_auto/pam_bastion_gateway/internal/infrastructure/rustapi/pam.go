// Metode API PAM pam_bastion_gateway pada osc_rest (Wave 3, Hari 17 / SESI 4.2).
// Kontrak: osc_docs/rest/contracts/w3.openapi.yaml — field JSON snake_case.
package rustapi

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
)

// PamRedeemData — bentuk §PamRedeemResult (secret plaintext sekali tampil,
// jalur internal gateway — TIDAK PERNAH di-log / dikirim ke browser).
type PamRedeemData struct {
	SessionID string `json:"session_id"`
	Target    struct {
		AssetID   string `json:"asset_id"`
		AssetName string `json:"asset_name"`
		Host      string `json:"host"`
		Port      int    `json:"port"`
	} `json:"target"`
	Account struct {
		Username    string `json:"username"`
		AccountType string `json:"account_type"`
		Secret      string `json:"secret"`
	} `json:"account"`
	Policy struct {
		CommandFilter *domain.CommandFilter `json:"command_filter"`
		MaxSessionMinutes int           `json:"max_session_minutes"`
	} `json:"policy"`
}

// RedeemTicket menukar ephemeral ticket sekali pakai dengan kredensial
// target (POST /api/v1/agents/pam/ticket/redeem — HMAC).
// 401 → ticket salah/kedaluwarsa; 409 → ticket sudah ditebus.
func (c *Client) RedeemTicket(ctx context.Context, req domain.RedeemTicketRequest) (domain.RedeemResult, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return domain.RedeemResult{}, fmt.Errorf("serialisasi payload redeem: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost, apiPrefix+"/agents/pam/ticket/redeem", body, true)
	if err != nil {
		return domain.RedeemResult{}, err
	}
	defer zeroBytes(data) // buffer respons (memuat plaintext secret) di-zero-ize

	envData, err := decodeEnvelope(data, "success")
	if err != nil {
		return domain.RedeemResult{}, err
	}
	var r PamRedeemData
	if err := json.Unmarshal(envData, &r); err != nil {
		return domain.RedeemResult{}, fmt.Errorf("%w: data redeem: %v", domain.ErrInvalidResponse, err)
	}
	if r.SessionID == "" || r.Target.Host == "" || r.Account.Username == "" || r.Account.Secret == "" {
		return domain.RedeemResult{}, fmt.Errorf("%w: data redeem tidak lengkap", domain.ErrInvalidResponse)
	}
	if r.Target.Port < 1 || r.Target.Port > 65535 {
		r.Target.Port = 22
	}
	out := domain.RedeemResult{
		SessionID: r.SessionID,
		Target: domain.TargetInfo{
			AssetID: r.Target.AssetID, AssetName: r.Target.AssetName,
			Host: r.Target.Host, Port: r.Target.Port,
		},
		Account: domain.RedeemSecret{
			Username:    r.Account.Username,
			AccountType: r.Account.AccountType,
			Secret:      []byte(r.Account.Secret),
		},
		Policy: domain.PolicyInfo{
			CommandFilter:     r.Policy.CommandFilter,
			MaxSessionMinutes: r.Policy.MaxSessionMinutes,
		},
	}
	// r.Account.Secret adalah string Go (immutable) — best-effort:
	// buffer JSON mentah & salinan []byte di-zero-ize setelah dipakai.
	zeroString(r.Account.Secret)
	return out, nil
}

// UploadRecording mengunggah rekaman sesi (immutable) —
// POST /api/v1/pam/sessions/{id}/recording?format=CAST_GZ (HMAC atas
// sha256(body); Content-Type application/octet-stream, body RAW bukan multipart).
func (c *Client) UploadRecording(ctx context.Context, sessionID, format string, body []byte) (domain.RecordingResult, error) {
	if format == "" {
		format = domain.RecordingFormatCastGZ
	}
	path := fmt.Sprintf("%s/pam/sessions/%s/recording?format=%s", apiPrefix, sessionID, format)
	data, err := c.doRequestRaw(ctx, httpMethodPost, path, "application/octet-stream", body, true)
	if err != nil {
		return domain.RecordingResult{}, err
	}
	envData, err := decodeEnvelope(data, "success")
	if err != nil {
		return domain.RecordingResult{}, err
	}
	var rec domain.RecordingResult
	if err := json.Unmarshal(envData, &rec); err != nil {
		return domain.RecordingResult{}, fmt.Errorf("%w: data recording: %v", domain.ErrInvalidResponse, err)
	}
	if rec.ObjectKey == "" || rec.Bucket == "" {
		return domain.RecordingResult{}, fmt.Errorf("%w: data recording tidak lengkap", domain.ErrInvalidResponse)
	}
	return rec, nil
}

// zeroBytes menimpa buffer sensitif dengan nol (best-effort memori).
func zeroBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// zeroString menimpa salinan byte string (Go string itu immutable —
// salinan inilah yang terkontrol; string aslinya GC-managed).
func zeroString(s string) {
	b := []byte(strings.Clone(s))
	zeroBytes(b)
}
