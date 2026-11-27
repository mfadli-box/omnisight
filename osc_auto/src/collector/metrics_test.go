package collector

import (
	"context"
	"crypto/hmac"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSendSignatureAndInvalidSignature(t *testing.T) {
	secret := []byte("test-only-secret")
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		if err := json.Unmarshal(body, &payload); err != nil || payload.AgentID != "host-a" || time.Since(payload.Timestamp) > time.Minute {
			t.Error("invalid telemetry payload")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	sender := Sender{Endpoint: server.URL, AgentID: "host-a", Secret: secret, Client: server.Client()}
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
