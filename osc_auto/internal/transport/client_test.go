package transport

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"omnisight/osc_auto/internal/domain"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestSignedAgentRequests(t *testing.T) {
	const id = "5b1cd41c-fc12-4d9a-add5-b77a12ce2434"
	const secret = "test-secret-for-agent-signing-only"
	for _, route := range []struct {
		name, path, prefix string
		send               func(*Client) error
	}{
		{"heartbeat", "/baas/v1/agents/heartbeat", "", func(client *Client) error {
			return client.Heartbeat(context.Background(), domain.Telemetry{MemoryTotal: 1024, DiskTotal: 2048})
		}},
		{"telemetry", "/baas/v1/agents/telemetry", "/baas/v1/agents/telemetry\n", func(client *Client) error {
			return client.Telemetry(context.Background(), domain.HostMetrics{CPUPct: 30})
		}},
		{"ops output", eventPath, eventPath + "\n", func(client *Client) error {
			return client.OpsOutput(context.Background(), "test-job", 1, "test output")
		}},
	} {
		t.Run(route.name, func(t *testing.T) {
			client := New("https://hub.example.com", id, secret)
			client.http.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
				defer r.Body.Close()
				body, err := io.ReadAll(r.Body)
				if err != nil {
					return nil, err
				}
				timestamp := r.Header.Get("X-Timestamp")
				if r.Method != http.MethodPost || r.URL.Path != route.path || timestamp == "" || r.Header.Get("X-Agent-Id") != id {
					t.Errorf("unexpected agent request %s %s", r.Method, r.URL.Path)
				}
				mac := hmac.New(sha256.New, []byte(secret))
				_, _ = io.WriteString(mac, route.prefix+id+"\n"+timestamp+"\n")
				_, _ = mac.Write(body)
				if r.Header.Get("X-Signature") != hex.EncodeToString(mac.Sum(nil)) {
					t.Error("signature does not cover the expected wire payload")
				}
				return &http.Response{StatusCode: http.StatusNoContent, Body: io.NopCloser(strings.NewReader(""))}, nil
			})
			if err := route.send(client); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestOpsClaimBindsSignedJobToCurrentRequest(t *testing.T) {
	const node = "5b1cd41c-fc12-4d9a-add5-b77a12ce2434"
	const key = "test-secret-for-agent-signing-only"
	for _, valid := range []bool{true, false} {
		client := New("https://hub.example.com", node, key)
		client.http.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
			defer r.Body.Close()
			var request struct {
				Nonce string `json:"nonce"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				return nil, err
			}
			if !valid {
				request.Nonce = "deadbeef"
			}
			payload, err := json.Marshal(domain.OpsJob{ID: "test-job", NodeID: node, Nonce: request.Nonce,
				Action: "terminal", ExpiresAt: time.Now().Add(time.Minute)})
			if err != nil {
				return nil, err
			}
			mac := hmac.New(sha256.New, []byte(key))
			_, _ = io.WriteString(mac, "osc:ops:job\n"+string(payload))
			body, err := json.Marshal(map[string]string{"payload": string(payload), "signature": hex.EncodeToString(mac.Sum(nil))})
			if err != nil {
				return nil, err
			}
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
		})
		if job, err := client.ClaimOps(t.Context(), true); valid != (err == nil && job != nil) {
			t.Fatalf("claim acceptance does not match request binding: %v", err)
		}
	}
}
