// Metode API enroll pam_bastion_gateway pada osc_rest (pola agent W2).
// Kontrak: osc_docs/rest/contracts/w3.openapi.yaml — field JSON snake_case.
package rustapi

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
)

const apiPrefix = "/api/v1"

// AgentEnrolledData — bentuk respons data enroll (AgentEnrolled).
type AgentEnrolledData struct {
	AgentID    string `json:"agent_id"`
	CompanyID  string `json:"company_id"`
	HmacSecret string `json:"hmac_secret"`
	NodeType   string `json:"node_type"`
	AssetTag   string `json:"asset_tag"`
}

// Enroll menukar one-time enrollment token dengan kredensial agent
// (POST /api/v1/agents/enroll — publik, tanpa HMAC).
// hmac_secret ditampilkan SEKALI oleh server; pemanggil wajib menyimpannya
// ke state terproteksi (internal/storage) segera setelah berhasil.
func (c *Client) Enroll(ctx context.Context, req domain.EnrollRequest) (domain.Credentials, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return domain.Credentials{}, fmt.Errorf("serialisasi payload enroll: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost, apiPrefix+"/agents/enroll", body, false)
	if err != nil {
		return domain.Credentials{}, err
	}
	envData, err := decodeEnvelope(data, "success")
	if err != nil {
		return domain.Credentials{}, err
	}
	var enrolled AgentEnrolledData
	if err := json.Unmarshal(envData, &enrolled); err != nil {
		return domain.Credentials{}, fmt.Errorf("%w: data enroll: %v", domain.ErrInvalidResponse, err)
	}
	if enrolled.AgentID == "" || enrolled.HmacSecret == "" || enrolled.CompanyID == "" {
		return domain.Credentials{}, fmt.Errorf("%w: data enroll tidak lengkap", domain.ErrInvalidResponse)
	}
	return domain.Credentials{
		AgentID:    enrolled.AgentID,
		CompanyID:  enrolled.CompanyID,
		HmacSecret: enrolled.HmacSecret,
		NodeType:   enrolled.NodeType,
		AssetTag:   enrolled.AssetTag,
	}, nil
}

// Konstanta method — menghindari string sihir tersebar.
const (
	httpMethodPost = "POST"
	httpMethodGet  = "GET"
)
