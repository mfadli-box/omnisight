package listener

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

const testSecretHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

// vektor v1 (RFC 4231 test case 2) — sanity secret handling.
const rfc4231Key2 = "4a656665" // "Jefe"

func signReq(secret []byte, ts int64, method, path string, body []byte) string {
	bodyHash := sha256.Sum256(body)
	canonical := ""
	canonical += itoa64(ts) + "\n" + method + "\n" + path + "\n" + hex.EncodeToString(bodyHash[:])
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

func itoa64(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		return "-" + string(b)
	}
	return string(b)
}

// TestVerifyVector — vektor tetap: kanonis "{ts}\n{METHOD}\n{path}\n{sha256(body)}".
func TestVerifyVector(t *testing.T) {
	secret, _ := hex.DecodeString(testSecretHex)
	body := []byte(`{"messages":[]}`)
	ts := time.Now().Unix()
	sig := signReq(secret, ts, "POST", EnqueuePath, body)
	if err := Verify(secret, itoa64(ts), "POST", EnqueuePath, body, sig, time.Now()); err != nil {
		t.Fatalf("signature valid harus diterima: %v", err)
	}
}

// TestVerifyNegative — replay, body tampering, signature salah, header hilang.
func TestVerifyNegative(t *testing.T) {
	secret, _ := hex.DecodeString(testSecretHex)
	body := []byte(`{"messages":[]}`)
	ts := time.Now().Unix()
	sig := signReq(secret, ts, "POST", EnqueuePath, body)

	cases := []struct {
		name   string
		ts     string
		method string
		path   string
		body   []byte
		sig    string
	}{
		{"replay 31s", itoa64(ts - 31), "POST", EnqueuePath, body, sig},
		{"replay -31s", itoa64(ts + 31), "POST", EnqueuePath, body, sig},
		{"body tamper", itoa64(ts), "POST", EnqueuePath, []byte(`{"messages":[{...}]}`), sig},
		{"method salah", itoa64(ts), "PUT", EnqueuePath, body, sig},
		{"path salah", itoa64(ts), "POST", "/other", body, sig},
		{"sig salah", itoa64(ts), "POST", EnqueuePath, body, "00" + sig[2:]},
		{"header hilang", "", "POST", EnqueuePath, body, ""},
	}
	for _, tc := range cases {
		if err := Verify(secret, tc.ts, tc.method, tc.path, tc.body, tc.sig, time.Now()); err == nil {
			t.Fatalf("kasus %q harus ditolak", tc.name)
		}
	}
}

// TestNewDenyByDefault — tanpa secret (atau secret malformed) listener
// menolak dibangun.
func TestNewDenyByDefault(t *testing.T) {
	if _, err := New(":0", "", nil, testLogger()); err == nil {
		t.Fatalf("tanpa secret listener harus menolak start")
	}
	if _, err := New(":0", "zz-not-hex", nil, testLogger()); err == nil {
		t.Fatalf("secret bukan hex harus menolak start")
	}
	if _, err := New(":0", rfc4231Key2, nil, testLogger()); err == nil {
		t.Fatalf("secret terlalu pendek harus menolak start")
	}
}

// TestHandleEnqueueEndToEnd — httptest: enqueue valid → 202 + hitungan;
// tanpa HMAC → 401; dedupe terhitung.
func TestHandleEnqueueEndToEnd(t *testing.T) {
	q := &memQueue{}
	s, err := New(":0", testSecretHex, q, testLogger())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	srv := httptest.NewServer(s.http.Handler)
	defer srv.Close()

	payload, _ := json.Marshal(enqueueRequest{Messages: []domain.OutboundMessage{validMsg()}})
	req, _ := http.NewRequest("POST", srv.URL+EnqueuePath, bytes.NewReader(payload))
	ts := time.Now().Unix()
	req.Header.Set("X-Flow-Timestamp", itoa64(ts))
	req.Header.Set("X-Flow-Signature", signReq([]byte{1, 2, 3}, ts, "POST", EnqueuePath, payload))

	res, err := http.DefaultClient.Do(req)
	// Signature dengan secret salah → 401.
	if err != nil || res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("secret salah harus 401, nyata %v/%v", res, err)
	}

	// Sekarang dengan secret benar.
	req2, _ := http.NewRequest("POST", srv.URL+EnqueuePath, bytes.NewReader(payload))
	req2.Header.Set("X-Flow-Timestamp", itoa64(time.Now().Unix()))
	req2.Header.Set("X-Flow-Signature", signReq(s.secret, time.Now().Unix(), "POST", EnqueuePath, payload))
	res2, err := http.DefaultClient.Do(req2)
	if err != nil || res2.StatusCode != http.StatusAccepted {
		t.Fatalf("enqueue valid harus 202, nyata %v/%v", res2, err)
	}

	// Dedupe: event sama → 202 + deduplicated=1.
	req3, _ := http.NewRequest("POST", srv.URL+EnqueuePath, bytes.NewReader(payload))
	req3.Header.Set("X-Flow-Timestamp", itoa64(time.Now().Unix()))
	req3.Header.Set("X-Flow-Signature", signReq(s.secret, time.Now().Unix(), "POST", EnqueuePath, payload))
	res3, err := http.DefaultClient.Do(req3)
	if err != nil || res3.StatusCode != http.StatusAccepted {
		t.Fatalf("dedupe harus tetap 202, nyata %v/%v", res3, err)
	}
	if q.deduped != 1 {
		t.Fatalf("deduplicated harus 1, nyata %d", q.deduped)
	}
}

// --- Fake antrean ------------------------------------------------------------

type memQueue struct {
	deduped int
	pending []domain.OutboundMessage
}

func (m *memQueue) Enqueue(msg domain.OutboundMessage) error {
	for _, p := range m.pending {
		if p.EventID == msg.EventID {
			m.deduped++
			return domain.ErrDuplicated
		}
	}
	m.pending = append(m.pending, msg)
	return nil
}

func (m *memQueue) ClaimDue(time.Time, int) []domain.OutboundMessage { return nil }
func (m *memQueue) Ack(string)                                       {}
func (m *memQueue) Retry(domain.OutboundMessage, time.Duration, int) bool {
	return false
}
func (m *memQueue) Len() int { return len(m.pending) }

func validMsg() domain.OutboundMessage {
	return domain.OutboundMessage{
		EventID: "evt-e2e",
		Event:   domain.EventUptimeDown,
		Channels: []domain.ChannelRef{{Type: domain.ChannelWebhook,
			Config: domain.ChannelConfig{URL: "https://hooks.example.invalid/x"}}},
	}
}
