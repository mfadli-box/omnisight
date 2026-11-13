// Metode API network_poller_agent pada osc_rest (Wave 2, Hari 13 / SESI 3.2).
// Kontrak: osc_docs/rest/contracts/w2.openapi.yaml — field JSON snake_case.
package rustapi

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
)

const apiPrefix = "/api/v1"

// Konstanta method — menghindari string sihir tersebar.
const (
	httpMethodPost = "POST"
	httpMethodGet  = "GET"
)

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

// IngestHeartbeat mengirim satu heartbeat monitor
// (POST /api/v1/agents/uptime/ingest — HMAC; monitor wajib milik company).
func (c *Client) IngestHeartbeat(ctx context.Context, hb domain.HeartbeatPayload) error {
	body, err := json.Marshal(hb)
	if err != nil {
		return fmt.Errorf("serialisasi payload heartbeat: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost, apiPrefix+"/agents/uptime/ingest", body, true)
	if err != nil {
		return err
	}
	_, err = decodeEnvelope(data, "accepted")
	return err
}

// IngestMetrics mengirim batch metrik SNMP interface
// (POST /api/v1/agents/metrics/ingest — HMAC; snmp_interfaces ≤ 500).
func (c *Client) IngestMetrics(ctx context.Context, batch domain.MetricsBatch) error {
	if len(batch.SnmpInterfaces) == 0 {
		return nil
	}
	if len(batch.SnmpInterfaces) > maxSnmpInterfacesPerBatch {
		batch.SnmpInterfaces = batch.SnmpInterfaces[:maxSnmpInterfacesPerBatch]
	}
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

// maxSnmpInterfacesPerBatch — batas server kontrak.
const maxSnmpInterfacesPerBatch = 500

// TimestampNow — helper dipakai usecase agar konsisten (UTC).
func TimestampNow() time.Time { return time.Now().UTC() }
