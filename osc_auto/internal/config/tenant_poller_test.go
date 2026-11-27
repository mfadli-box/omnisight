package config

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestRefreshUpdatesAndRejectsInvalidContext(t *testing.T) {
	var code atomic.Value
	code.Store("FIRST")
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.Header.Get("Authorization") != "Bearer test-token" || r.Header.Get("X-Agent-ID") != "agent-a" {
			t.Error("unauthorized tenant context request")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		fmt.Fprintf(w, `{"agent_id":"agent-a","company_id":"11111111-1111-1111-1111-111111111111","area_id":"22222222-2222-2222-2222-222222222222","store_id":"33333333-3333-3333-3333-333333333333","company_code":"%s","area_code":"WEST"}`, code.Load().(string))
	}))
	defer server.Close()
	poller := &Poller{Endpoint: server.URL + "/api/v1/agent/tenant-context", AgentID: "agent-a", Token: "test-token", Client: server.Client()}
	if _, ok := poller.Current(); ok {
		t.Fatal("accepted missing tenant context")
	}
	if err := poller.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got, ok := poller.Current(); !ok || got.CompanyCode != "FIRST" {
		t.Fatalf("first context: %+v, %v", got, ok)
	}
	code.Store("SECOND")
	if err := poller.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got, ok := poller.Current(); !ok || got.CompanyCode != "SECOND" {
		t.Fatalf("updated context: %+v, %v", got, ok)
	}
	code.Store("bad code")
	if err := poller.Refresh(context.Background()); err == nil {
		t.Fatal("accepted invalid code")
	}
	if got, ok := poller.Current(); !ok || got.CompanyCode != "SECOND" {
		t.Fatalf("invalid response replaced context: %+v, %v", got, ok)
	}
	poller.mu.Lock()
	poller.updatedAt = time.Now().Add(-3 * PollInterval)
	poller.mu.Unlock()
	if _, ok := poller.Current(); ok {
		t.Fatal("accepted stale context")
	}
}

func TestRefreshRequiresHTTPSAndRejectsRedirect(t *testing.T) {
	poller := &Poller{Endpoint: "http://example.com/api/v1/agent/tenant-context", AgentID: "agent-a", Token: "test-token"}
	if err := poller.Refresh(context.Background()); err == nil {
		t.Fatal("accepted HTTP endpoint")
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "https://example.com/steal")
		w.WriteHeader(http.StatusFound)
	}))
	defer server.Close()
	poller.Endpoint = server.URL + "/api/v1/agent/tenant-context"
	poller.Client = server.Client()
	if err := poller.Refresh(context.Background()); err == nil {
		t.Fatal("accepted redirect")
	}
}

func TestRunAutomaticallyUpdatesContext(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		code := "FIRST"
		if calls.Add(1) > 1 {
			code = "SECOND"
		}
		fmt.Fprintf(w, `{"agent_id":"agent-a","company_id":"11111111-1111-1111-1111-111111111111","area_id":"22222222-2222-2222-2222-222222222222","store_id":"33333333-3333-3333-3333-333333333333","company_code":"%s","area_code":"WEST"}`, code)
	}))
	defer server.Close()
	poller := &Poller{Endpoint: server.URL + "/api/v1/agent/tenant-context", AgentID: "agent-a", Token: "test-token", Client: server.Client(), interval: 10 * time.Millisecond}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	done := make(chan struct{})
	go func() { poller.Run(ctx, func(err error) { t.Errorf("poll failed: %v", err) }); close(done) }()
	for {
		if tenant, ok := poller.Current(); ok && tenant.CompanyCode == "SECOND" {
			cancel()
			<-done
			return
		}
		select {
		case <-ctx.Done():
			t.Fatal("periodic refresh did not update tenant context")
		case <-time.After(5 * time.Millisecond):
		}
	}
}
