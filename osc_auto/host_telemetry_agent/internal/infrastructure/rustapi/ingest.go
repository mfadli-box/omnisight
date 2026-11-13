// Metode API host_telemetry_agent pada osc_rest (Wave 2, Hari 13 / SESI 3.2).
// Kontrak: osc_docs/rest/contracts/w2.openapi.yaml — field JSON snake_case.
package rustapi

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
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

// IngestInventory mengirim snapshot inventaris
// (POST /api/v1/agents/inventory/ingest — HMAC).
func (c *Client) IngestInventory(ctx context.Context, inv domain.Inventory) error {
	body, err := json.Marshal(inv)
	if err != nil {
		return fmt.Errorf("serialisasi payload inventory: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost, apiPrefix+"/agents/inventory/ingest", body, true)
	if err != nil {
		return err
	}
	_, err = decodeEnvelope(data, "accepted")
	return err
}

// IngestMetrics mengirim batch metrik host + container
// (POST /api/v1/agents/metrics/ingest — HMAC; containers ≤ 200).
func (c *Client) IngestMetrics(ctx context.Context, batch domain.MetricsBatch) error {
	body, err := json.Marshal(batch)
	if err != nil {
		return fmt.Errorf("serialisasi payload metrics: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost, apiPrefix+"/agents/metrics/ingest", body, true)
	if err != nil {
		return err
	}
	_, err = decodeEnvelope(data, "accepted")
	return err
}

// IngestSecurity mengirim batch SecOps (FIM) —
// POST /api/v1/agents/security/ingest (HMAC; kontrak w3.openapi.yaml,
// respons 202 {"status":"accepted"}).
func (c *Client) IngestSecurity(ctx context.Context, batch domain.SecurityBatch) error {
	body, err := json.Marshal(batch)
	if err != nil {
		return fmt.Errorf("serialisasi payload security: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost, apiPrefix+"/agents/security/ingest", body, true)
	if err != nil {
		return err
	}
	_, err = decodeEnvelope(data, "accepted")
	return err
}

// Konstanta method — menghindari string sihir tersebar.
const (
	httpMethodPost = "POST"
	httpMethodGet  = "GET"
)
