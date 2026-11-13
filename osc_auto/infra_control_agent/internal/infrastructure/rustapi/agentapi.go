// Metode API infra_control_agent pada osc_rest (Wave 2, Hari 13 / SESI 3.2).
//
// CATATAN AGENT-PLANE API: dispatch dibaca dari outbox `activity_logs` di
// sisi server; endpoint plane agent yang diminta SESI 3.2 (diperluas dari
// kontrak w2.openapi.yaml, lihat README §3):
//
//	GET  /api/v1/agents/infra/dispatches                 — list pending
//	POST /api/v1/agents/infra/dispatches/{ref}/ack       — laporkan hasil
//	POST /api/v1/agents/logs                             — sudah kontrak W2
package rustapi

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/domain"
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

// FetchPending menarik daftar dispatch pending dari outbox
// (GET /api/v1/agents/infra/dispatches — HMAC). 404/daftar kosong → nil.
func (c *Client) FetchPending(ctx context.Context) ([]domain.Dispatch, error) {
	data, err := c.doRequest(ctx, httpMethodGet, apiPrefix+"/agents/infra/dispatches", nil, true)
	if err != nil {
		return nil, err
	}
	envData, err := decodeEnvelope(data, "success")
	if err != nil {
		return nil, err
	}
	var list struct {
		Dispatches []domain.Dispatch `json:"dispatches"`
	}
	if err := json.Unmarshal(envData, &list); err != nil {
		return nil, fmt.Errorf("%w: daftar dispatch: %v", domain.ErrInvalidResponse, err)
	}
	return list.Dispatches, nil
}

// Ack melaporkan hasil eksekusi (POST /api/v1/agents/infra/dispatches/{ref}/ack — HMAC).
func (c *Client) Ack(ctx context.Context, result domain.AckResult) error {
	body, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("serialisasi payload ack: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost,
		apiPrefix+"/agents/infra/dispatches/"+result.DispatchRef+"/ack", body, true)
	if err != nil {
		return err
	}
	_, err = decodeEnvelope(data, "success", "accepted")
	return err
}

// Publish mengirim baris log live (POST /api/v1/agents/logs — HMAC;
// baris ≤ 100 × 2000 char — dipotong defensif di sini juga).
func (c *Client) Publish(ctx context.Context, lp domain.LogPublish) error {
	if len(lp.Lines) == 0 {
		return nil
	}
	if len(lp.Lines) > 100 {
		lp.Lines = lp.Lines[len(lp.Lines)-100:]
	}
	for i := range lp.Lines {
		if len(lp.Lines[i]) > 2000 {
			lp.Lines[i] = lp.Lines[i][:2000]
		}
	}
	body, err := json.Marshal(lp)
	if err != nil {
		return fmt.Errorf("serialisasi payload logs: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost, apiPrefix+"/agents/logs", body, true)
	if err != nil {
		return err
	}
	_, err = decodeEnvelope(data, "accepted")
	return err
}

// TimestampNow — helper dipakai usecase agar konsisten (UTC).
func TimestampNow() time.Time { return time.Now().UTC() }
