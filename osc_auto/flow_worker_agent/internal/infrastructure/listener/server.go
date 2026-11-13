// Package listener — inbound HTTP untuk produsen (osc_rest / agent lain):
// enqueue pesan notifikasi ke antrean lokal flow_worker_agent.
//
// Autentikasi (deny-by-default): HMAC-SHA256 shared secret per-request atas
// kanonis "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}" dengan header
// X-Flow-Timestamp (window replay ±30 s) + X-Flow-Signature (hex).
// Listener menolak start tanpa secret (ErrAuthRequired) — kecuali
// explicitly disabled.
//
// Batas: body ≤ 1 MiB (http.MaxBytesReader), hanya POST path tunggal,
// timeout server berlapis, GET /healthz tanpa auth (liveness container).
package listener

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

const (
	// maxBodyBytes — batas body enqueue (≤ ~200 pesan @4 channel).
	maxBodyBytes = 1 << 20
	// replayWindow — jendela timestamp (mirror ±30 s kontrak HMAC agent).
	replayWindow = 30 * time.Second
	// maxMessagesPerBatch — batas jumlah pesan per enqueue.
	maxMessagesPerBatch = 200
)

// EnqueuePath — path HTTP tunggal listener.
const EnqueuePath = "/api/v1/flow/enqueue"

// Server listener HTTP.
type Server struct {
	http   *http.Server
	secret []byte
	queue  domain.MessageQueue
	logger *slog.Logger
}

// New membangun listener. secret kosong → error ErrAuthRequired (deny by
// default).
func New(addr, secretHex string, q domain.MessageQueue, logger *slog.Logger) (*Server, error) {
	if len(secretHex) != 64 {
		return nil, fmt.Errorf("%w: FLOW_WORKER_LISTEN_SECRET_HEX harus 64 karakter hex (32 byte HMAC-SHA256)", domain.ErrAuthRequired)
	}
	secret, err := hex.DecodeString(secretHex)
	if err != nil {
		return nil, fmt.Errorf("%w: secret bukan hex valid", domain.ErrAuthRequired)
	}

	mux := http.NewServeMux()
	s := &Server{secret: secret, queue: q, logger: logger}
	mux.HandleFunc(EnqueuePath, s.handleEnqueue)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	s.http = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	return s, nil
}

// Start menjalankan listener (blocking; kembalikan error non-ErrServerClosed).
func (s *Server) Start() error {
	err := s.http.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

// Close mematikan listener dengan grace 5 s.
func (s *Server) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.http.Shutdown(ctx)
}

// enqueueRequest — payload produsen.
type enqueueRequest struct {
	Messages []domain.OutboundMessage `json:"messages"`
}

// enqueueResponse — ringkasan hasil (tanpa detail secret).
type enqueueResponse struct {
	Status string `json:"status"`
	Data   struct {
		Enqueued     int `json:"enqueued"`
		Deduplicated int `json:"deduplicated"`
	} `json:"data"`
}

// handleEnqueue — POST /api/v1/flow/enqueue (HMAC wajib).
func (s *Server) handleEnqueue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorEnvelope("VALIDATION_ERROR", "metode harus POST"))
		return
	}
	body := io.Reader(io.LimitReader(r.Body, maxBodyBytes+1))
	data, err := io.ReadAll(body)
	if err != nil || len(data) > maxBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorEnvelope("PAYLOAD_TOO_LARGE", "body terlalu besar"))
		return
	}
	if err := Verify(s.secret, r.Header.Get("X-Flow-Timestamp"), r.Method, r.URL.Path, data, r.Header.Get("X-Flow-Signature"), time.Now()); err != nil {
		s.logger.Warn("enqueue ditolak (HMAC)", "err", err.Error(), "remote", r.RemoteAddr)
		writeJSON(w, http.StatusUnauthorized, errorEnvelope("UNAUTHORIZED", "signature tidak valid"))
		return
	}

	var req enqueueRequest
	if err := json.Unmarshal(data, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorEnvelope("VALIDATION_ERROR", "body bukan JSON valid"))
		return
	}
	if len(req.Messages) == 0 || len(req.Messages) > maxMessagesPerBatch {
		writeJSON(w, http.StatusBadRequest, errorEnvelope("VALIDATION_ERROR",
			fmt.Sprintf("messages wajib 1..%d", maxMessagesPerBatch)))
		return
	}

	res := enqueueResponse{Status: "accepted"}
	for _, m := range req.Messages {
		switch err := s.queue.Enqueue(m); {
		case err == nil:
			res.Data.Enqueued++
		case errors.Is(err, domain.ErrDuplicated):
			res.Data.Deduplicated++
		default:
			s.logger.Warn("enqueue gagal", "event_id", m.EventID, "err", err.Error())
			writeJSON(w, http.StatusBadRequest, errorEnvelope("VALIDATION_ERROR", "pesan ditolak: "+err.Error()))
			return
		}
	}
	s.logger.Info("batch notifikasi masuk", "enqueued", res.Data.Enqueued,
		"deduplicated", res.Data.Deduplicated, "queue_len", s.queue.Len())
	writeJSON(w, http.StatusAccepted, res)
}

// Verify memvalidasi kanonis HMAC — diekspor untuk unit test vektor tetap.
func Verify(secret []byte, tsHeader, method, path string, body []byte, sig string, now time.Time) error {
	if tsHeader == "" || sig == "" {
		return fmt.Errorf("%w: header HMAC hilang", domain.ErrUnauthorized)
	}
	var ts int64
	if _, err := fmt.Sscanf(tsHeader, "%d", &ts); err != nil {
		return fmt.Errorf("%w: timestamp bukan angka", domain.ErrUnauthorized)
	}
	if d := now.Sub(time.Unix(ts, 0)); d > replayWindow || d < -replayWindow {
		return fmt.Errorf("%w: timestamp di luar window ±%s", domain.ErrUnauthorized, replayWindow)
	}
	bodyHash := sha256.Sum256(body)
	canonical := fmt.Sprintf("%d\n%s\n%s\n%s", ts, method, path, hex.EncodeToString(bodyHash[:]))
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(canonical))
	expected := mac.Sum(nil)
	got, err := hex.DecodeString(sig)
	if err != nil || !hmac.Equal(got, expected) {
		return fmt.Errorf("%w: signature mismatch", domain.ErrUnauthorized)
	}
	return nil
}

// errorEnvelope — bentuk error seragam kontrak omnisight.
func errorEnvelope(code, message string) map[string]any {
	return map[string]any{
		"status": "error",
		"error":  map[string]string{"code": code, "message": message},
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
