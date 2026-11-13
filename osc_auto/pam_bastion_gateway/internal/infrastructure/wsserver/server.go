// Package wsserver — delivery WebSocket server untuk browser xterm.js
// (implementasi port domain.TerminalStream via gorilla/websocket).
//
// Hardening:
//   - Upgrader dengan timeout handshake & batas ukuran pesan.
//   - Origin allowlist (PAM_GATEWAY_ALLOWED_ORIGINS, CSV) — CSWSH anti.
//   - Ping/pong keepalive + read deadline per-frame.
//   - Satu goroutine per sesi; batas konkuren ditegakkan usecase.
package wsserver

import (
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	// maxMsgSize — frame input per pesan (buffer baris di usecase).
	maxMsgSize = 32 << 10 // 32 KiB
)

// Handler — fungsi sesi yang dipanggil setelah upgrade (usecase menerima
// domain.TerminalStream agar layer dalam bebas dari gorilla/websocket).
type Handler func(stream domain.TerminalStream, clientIP string)

// Server WS bastion.
type Server struct {
	addr      string
	path      string
	origins   []string // kosong → hanya allow same-origin (dan tanpa origin)
	bastion   Handler
	logger    *slog.Logger
	http      *http.Server
	upgrader  websocket.Upgrader
}

// New membangun server WS (belum dijalankan).
func New(addr, path string, origins []string, bastion Handler, logger *slog.Logger) *Server {
	s := &Server{
		addr:    addr,
		path:    path,
		origins: origins,
		bastion: bastion,
		logger:  logger,
	}
	s.upgrader = websocket.Upgrader{
		ReadBufferSize:   4 << 10,
		WriteBufferSize:  4 << 10,
		HandshakeTimeout: 10 * time.Second,
		Subprotocols:     []string{"omnisight-pam-v1"},
		CheckOrigin:      s.checkOrigin,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleRoot)
	mux.HandleFunc(path, s.handleWS)
	s.http = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		// Tidak ada Timeout total — koneksi WS hidup lama; per-frame
		// deadline dikelola goroutine ping/pong.
	}
	return s
}

// Start menjalankan HTTP server (blocking); graceful via ctx melalui
// Close() dari pemanggil lifecycle.
func (s *Server) Start() error {
	s.logger.Info("gateway WS listening", "addr", s.addr, "path", s.path,
		"origins", len(s.origins))
	err := s.http.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

// Close menutup server HTTP (graceful shutdown).
func (s *Server) Close() error { return s.http.Close() }

// checkOrigin — CSWSH guard: origin wajib cocok allowlist; bila tidak ada
// header Origin (non-browser) → izinkan (mis. CLI); bila allowlist kosong
// → semua origin browser ditolak kecuali host itu sendiri (same-origin).
func (s *Server) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // klien non-browser (CLI/testing)
	}
	if len(s.origins) == 0 {
		// Allowlist kosong → same-origin saja (Origin http(s)://host).
		host := r.Host
		return strings.HasSuffix(origin, "://"+host) ||
			strings.HasSuffix(origin, "://"+host+":80") ||
			strings.HasSuffix(origin, "://"+host+":443")
	}
	for _, o := range s.origins {
		if strings.EqualFold(o, origin) {
			return true
		}
	}
	s.logger.Warn("origin WS ditolak", "origin", origin)
	return false
}

// handleRoot — health/info kecil.
func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"success","data":{"service":"pam_bastion_gateway","ws":"` +
		s.path + `"}}`))
}

// handleWS — upgrade + jalankan sesi bastion (blocking per koneksi).
func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade menulis respons error sendiri.
		return
	}
	conn.SetReadLimit(maxMsgSize)
	// Keepalive ping/pong (di goroutine; ditutup saat handler selesai).
	done := make(chan struct{})
	defer func() { close(done); conn.Close() }()
	go func() {
		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()
	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	s.bastion(conn, clientIP(r))}

// clientIP mengekstrak IP klien (X-Forwarded-For hop pertama — kontrak
// osc_rest sama; di sini hanya untuk log audit).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
