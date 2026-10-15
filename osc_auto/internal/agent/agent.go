// Package agent berisi logika bersama untuk semua agen OmniSight (osc_auto).
//
// Agen adalah biner per-VM yang hanya berbicara dengan osc_rest melalui grup
// `/rest/agent` (lihat osc_docs/planning/blueprint.md §2). Agen tidak pernah
// mengakses database. Setiap agen mengekspos endpoint kesehatan lokal dan
// mengirim heartbeat ke backend.
//
// CATATAN STATUS: kerangka agen ini adalah scaffold. Endpoint operasional per
// modul (POD/NET/OBS/VMS/SEC/PAM/WEB/DSO) akan ditambahkan mengikuti
// osc_auto/agent_* dan grup `/rest/agent` di osc_rest.
package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Version adalah versi agen (naikkan saat rilis).
const Version = "0.1.0"

// Config menampung konfigurasi agen dari environment.
type Config struct {
	ID           string
	Role         string
	Capabilities []string
	RestURL      string
	Token        string
	ListenAddr   string
	Interval     time.Duration
}

// Default membuat konfigurasi agen untuk id/role/capabilities tertentu,
// lalu melengkapinya dari environment (OSC_*).
func Default(id, role string, capabilities []string) Config {
	cfg := Config{
		ID:           id,
		Role:         role,
		Capabilities: capabilities,
		RestURL:      "http://127.0.0.1:37772/rest/agent",
		ListenAddr:   "0.0.0.0:37775",
		Interval:     30 * time.Second,
	}
	if v := strings.TrimSpace(os.Getenv("OSC_AGENT_ID")); v != "" {
		cfg.ID = v
	}
	if v := strings.TrimSpace(os.Getenv("OSC_AGENT_ROLE")); v != "" {
		cfg.Role = v
	}
	if v := strings.TrimSpace(os.Getenv("OSC_REST_URL")); v != "" {
		cfg.RestURL = strings.TrimRight(v, "/")
	}
	if v := strings.TrimSpace(os.Getenv("OSC_AGENT_TOKEN")); v != "" {
		cfg.Token = v
	}
	if v := strings.TrimSpace(os.Getenv("OSC_AGENT_LISTEN")); v != "" {
		cfg.ListenAddr = v
	}
	if v := strings.TrimSpace(os.Getenv("OSC_AGENT_CAPABILITIES")); v != "" {
		cfg.Capabilities = splitTrim(v)
	}
	if v := strings.TrimSpace(os.Getenv("OSC_AGENT_INTERVAL")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.Interval = time.Duration(n) * time.Second
		}
	}
	return cfg
}

func splitTrim(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func hostname() string {
	h, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return h
}

// Run menjalankan server HTTP agen + heartbeat hingga sinyal berhenti.
func Run(cfg Config) {
	started := time.Now()
	log.SetPrefix("[" + cfg.ID + "] ")
	log.Printf("starting agent role=%s caps=%v rest=%s listen=%s interval=%s",
		cfg.Role, cfg.Capabilities, cfg.RestURL, cfg.ListenAddr, cfg.Interval)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":       "ok",
			"id":           cfg.ID,
			"role":         cfg.Role,
			"capabilities": cfg.Capabilities,
			"version":      Version,
			"uptime_sec":   int(time.Since(started).Seconds()),
			"time":         time.Now().UTC().Format(time.RFC3339),
		})
	})
	mux.HandleFunc("/info", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"id":           cfg.ID,
			"role":         cfg.Role,
			"capabilities": cfg.Capabilities,
			"hostname":     hostname(),
			"version":      Version,
		})
	})

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		log.Printf("agent http listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server failed: %v", err)
		}
	}()

	go heartbeatLoop(ctx, cfg)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Printf("shutting down...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("forced shutdown: %v", err)
	}
	log.Printf("stopped")
}

func heartbeatLoop(ctx context.Context, cfg Config) {
	// Kirim sekali saat mulai, lalu berkala.
	sendHeartbeat(ctx, cfg)
	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sendHeartbeat(ctx, cfg)
		}
	}
}

func sendHeartbeat(ctx context.Context, cfg Config) {
	payload := map[string]any{
		"id":           cfg.ID,
		"role":         cfg.Role,
		"capabilities": cfg.Capabilities,
		"hostname":     hostname(),
		"version":      Version,
		"time":         time.Now().UTC().Format(time.RFC3339),
	}
	body, _ := json.Marshal(payload)
	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, cfg.RestURL+"/heartbeat", bytes.NewReader(body))
	if err != nil {
		log.Printf("heartbeat build error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", cfg.ID)
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("heartbeat failed: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		// Endpoint heartbeat backend mungkin belum diimplementasikan.
		log.Printf("heartbeat status=%d", resp.StatusCode)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
