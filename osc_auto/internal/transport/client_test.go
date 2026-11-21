package transport

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"strings"
	"testing"

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
