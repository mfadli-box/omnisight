// Metode API flow_worker_agent pada osc_rest (Wave 3, Hari 17 / SESI 4.2).
// Kontrak: osc_docs/rest/contracts/w3.openapi.yaml — field JSON snake_case.
package rustapi

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

const apiPrefix = "/api/v1"

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
	var enrolled domain.EnrollResponse
	if err := json.Unmarshal(envData, &enrolled); err != nil {
		return domain.Credentials{}, fmt.Errorf("%w: data enroll: %v", domain.ErrInvalidResponse, err)
	}
	if enrolled.AgentID == "" || enrolled.HmacSecret == "" || enrolled.CompanyID == "" {
		return domain.Credentials{}, fmt.Errorf("%w: data enroll tidak lengkap", domain.ErrInvalidResponse)
	}
	return domain.Credentials(enrolled), nil
}

// PurgeRetention memicu purge retensi terjadwal
// (POST /api/v1/agents/retention/purge — HMAC + allowlist env
// RETENTION_PURGE_AGENT_IDS di server, deny-by-default; kontrak w3,
// respons 202 {"status":"accepted","data":{dry_run,purged}}).
// Kebijakan hari (30–90, clamp server-side) dikendalikan env osc_rest —
// agent hanya memicu.
func (c *Client) PurgeRetention(ctx context.Context, dryRun bool) (map[string]int64, error) {
	body, err := json.Marshal(map[string]bool{"dry_run": dryRun})
	if err != nil {
		return nil, fmt.Errorf("serialisasi payload purge: %w", err)
	}
	data, err := c.doRequest(ctx, httpMethodPost, apiPrefix+"/agents/retention/purge", body, true)
	if err != nil {
		return nil, err
	}
	envData, err := decodeEnvelope(data, "accepted")
	if err != nil {
		return nil, err
	}
	var res domain.RetentionResult
	if err := json.Unmarshal(envData, &res); err != nil {
		return nil, fmt.Errorf("%w: data purge: %v", domain.ErrInvalidResponse, err)
	}
	return res.Purged, nil
}
