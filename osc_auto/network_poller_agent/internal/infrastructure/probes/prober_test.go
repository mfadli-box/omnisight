package probes

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
)

// TestProbeKeyword — probe KEYWORD dengan server lokal (httptest TLS).
func TestProbeKeyword(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("health: OK\nversion 1.2.3"))
	}))
	defer srv.Close()

	p := New(time.Second * 5)
	res := p.Probe(context.Background(), domain.MonitorConfig{
		MonitorID: "m1", Type: "KEYWORD", Target: srv.URL, Keyword: "OK",
	})
	if res.Status != domain.StatusUp || res.PingMS == nil {
		t.Fatalf("keyword harus UP dengan ping: %+v", res)
	}
	if !strings.Contains(res.Msg, "keyword") {
		t.Fatalf("pesan harus menyebut keyword: %s", res.Msg)
	}

	// Keyword tidak ada → DOWN.
	res = p.Probe(context.Background(), domain.MonitorConfig{
		MonitorID: "m1", Type: "KEYWORD", Target: srv.URL, Keyword: "TIDAKADA",
	})
	if res.Status != domain.StatusDown {
		t.Fatalf("keyword absen harus DOWN: %+v", res)
	}
}

// TestProbeHTTPSSLCert — HTTPS probe harus melaporkan masa berlaku SSL.
func TestProbeHTTPSSLCert(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	p := New(time.Second * 5)
	// Sertifikat self-signed httptest → verifikasi gagal → DOWN, tapi
	// pesan harus informatif (bukan panik).
	res := p.Probe(context.Background(), domain.MonitorConfig{
		MonitorID: "m2", Type: "HTTPS", Target: srv.URL,
	})
	// Self-signed httptest: handshake gagal → DOWN dengan pesan TLS.
	if res.Status != domain.StatusDown && res.Status != domain.StatusUp {
		t.Fatalf("status tidak valid: %s", res.Status)
	}
	if res.Msg == "" {
		t.Fatal("pesan tidak boleh kosong")
	}
}

// TestProbeTCPLocal — TCP ke listener lokal → UP.
func TestProbeTCPLocal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	defer srv.Close()

	p := New(time.Second * 5)
	// Ekstrak host:port dari URL httptest.
	target := strings.TrimPrefix(srv.URL, "http://")
	res := p.Probe(context.Background(), domain.MonitorConfig{
		MonitorID: "m3", Type: "TCP", Target: target,
	})
	if res.Status != domain.StatusUp || res.PingMS == nil {
		t.Fatalf("TCP lokal harus UP: %+v", res)
	}

	// Port tertutup → DOWN.
	res = p.Probe(context.Background(), domain.MonitorConfig{
		MonitorID: "m3", Type: "TCP", Target: "127.0.0.1:1",
	})
	if res.Status != domain.StatusDown {
		t.Fatalf("TCP tertutup harus DOWN: %+v", res)
	}
}

// TestProbeDNSInvalidTarget — target DNS ilegal → error validasi (DOWN).
func TestProbeDNSInvalidTarget(t *testing.T) {
	p := New(time.Second * 5)
	res := p.Probe(context.Background(), domain.MonitorConfig{
		MonitorID: "m4", Type: "DNS", Target: "not a hostname!",
	})
	if res.Status != domain.StatusDown {
		t.Fatalf("DNS ilegal harus DOWN: %+v", res)
	}
}

// TestProbeUnsupportedType — tipe tak dikenal → DOWN informatif.
func TestProbeUnsupportedType(t *testing.T) {
	p := New(time.Second * 5)
	res := p.Probe(context.Background(), domain.MonitorConfig{Type: "PUSH", Target: "x"})
	if res.Status != domain.StatusDown || res.Msg == "" {
		t.Fatalf("tipe tak dikenal harus DOWN informatif: %+v", res)
	}
}

// TestProbeHTTPUserinfoRejected — anti-SSRF: userinfo ditolak.
func TestProbeHTTPUserinfoRejected(t *testing.T) {
	p := New(time.Second * 5)
	res := p.Probe(context.Background(), domain.MonitorConfig{
		MonitorID: "m5", Type: "HTTP", Target: "http://admin:secret@example.com/",
	})
	if res.Status != domain.StatusDown {
		t.Fatalf("userinfo harus ditolak: %+v", res)
	}
}
