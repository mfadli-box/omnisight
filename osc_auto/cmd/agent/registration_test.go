package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIdentityEncryption(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "agent.json")
	want := agentIdentity{"agent-123", "private-token"}
	if err := saveIdentity(path, key, want); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), want.AgentToken) {
		t.Fatal("plaintext token in identity file")
	}
	got, err := loadIdentity(path, key)
	if err != nil || got != want {
		t.Fatalf("identity round trip failed: %v", err)
	}
	data[len(data)-5] ^= 1
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadIdentity(path, key); err == nil {
		t.Fatal("tampered identity accepted")
	}
}

func TestRegisterAgent(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/agent/register" {
			t.Error("unexpected request")
		}
		var fp hostFingerprint
		if err := json.NewDecoder(r.Body).Decode(&fp); err != nil || fp.Fingerprint != "digest" {
			t.Error("invalid fingerprint body")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"agent_id":"agent-123","agent_token":"secret"}`))
	}))
	defer server.Close()
	got, err := registerAgent(context.Background(), server.URL+"/api/v1/agent/register", hostFingerprint{Fingerprint: "digest"}, server.Client())
	if err != nil || got.AgentID != "agent-123" || got.AgentToken != "secret" {
		t.Fatalf("register failed: %v", err)
	}
	if _, err := registerAgent(context.Background(), "http://example.com/api/v1/agent/register", hostFingerprint{}, nil); err == nil {
		t.Fatal("HTTP accepted")
	}
}
