package collector

import (
	"context"
	"crypto/hmac"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"omnisight/osc_auto/internal/config"
	"testing"
	"time"
)

func TestSendSignatureAndInvalidSignature(t *testing.T) {
	secret := []byte("test-only-secret")
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agent/tenant-context" {
			_, _ = w.Write([]byte(`{"agent_id":"host-a","company_id":"11111111-1111-1111-1111-111111111111","area_id":"22222222-2222-2222-2222-222222222222","store_id":"33333333-3333-3333-3333-333333333333","company_code":"ACME","area_code":"WEST"}`))
			return
		}
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/json" {
			t.Error("unexpected request method or content type")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		body, _ := io.ReadAll(r.Body)
		provided, err := hex.DecodeString(r.Header.Get("X-Agent-Signature"))
		if err != nil || !hmac.Equal(provided, mustDecodeHex(Signature(body, secret))) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var payload Payload
		if err := json.Unmarshal(body, &payload); err != nil || payload.AgentID != "host-a" || payload.CompanyCode != "ACME" || payload.AreaCode != "WEST" || payload.CompanyID == "" || payload.AreaID == "" || payload.StoreID == "" || time.Since(payload.Timestamp) > time.Minute {
			t.Error("invalid telemetry payload")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	poller := &config.Poller{Endpoint: server.URL + "/api/v1/agent/tenant-context", AgentID: "host-a", Token: "agent-token", Client: server.Client()}
	if err := poller.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	sender := Sender{Endpoint: server.URL, AgentID: "host-a", Secret: secret, Client: server.Client(), Tenant: poller}
	if err := sender.Send(context.Background(), Metrics{CPUPercent: 25}); err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}
	sender.Secret = []byte("wrong-secret")
	if err := sender.Send(context.Background(), Metrics{}); err == nil || err.Error() != "telemetry rejected: HTTP 401" {
		t.Fatalf("invalid signature result: %v", err)
	}
}

func mustDecodeHex(value string) []byte {
	decoded, _ := hex.DecodeString(value)
	return decoded
}

func TestEndpointRequiresHTTPS(t *testing.T) {
	err := (Sender{Endpoint: "http://localhost/telemetry", AgentID: "host-a", Secret: []byte("secret")}).Send(context.Background(), Metrics{})
	if err == nil {
		t.Fatal("accepted cleartext HTTP endpoint")
	}
}

func TestCollectHostMetrics(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	metrics, err := Collect(ctx, "")
	if err != nil {
		t.Fatalf("collect host metrics: %v", err)
	}
	if metrics.CPUPercent < 0 || metrics.CPUPercent > 100 || metrics.RAMPercent < 0 || metrics.RAMPercent > 100 {
		t.Fatalf("invalid percentages: %+v", metrics)
	}
}
