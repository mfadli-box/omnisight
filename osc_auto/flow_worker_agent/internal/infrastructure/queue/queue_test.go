package queue

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
)

// osReadFile alias kecil agar test tidak mengimpor os dua tempat.
func osReadFile(p string) ([]byte, error) { return os.ReadFile(p) }

const testKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func testMsg(id string) domain.OutboundMessage {
	return domain.OutboundMessage{
		EventID: id,
		Event:   domain.EventSIEMCritical,
		Channels: []domain.ChannelRef{{
			Type:   domain.ChannelTelegram,
			Config: domain.ChannelConfig{BotToken: "sekret-token", ChatID: "123"},
		}},
	}
}

// TestEnqueueClaimAckRoundtrip — siklus dasar enqueue → claim → ack.
func TestEnqueueClaimAckRoundtrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "queue.json")
	q, err := Open(path, "")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := q.Enqueue(testMsg("evt-1")); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if q.Len() != 1 {
		t.Fatalf("Len harus 1, nyata %d", q.Len())
	}
	due := q.ClaimDue(time.Now().UTC(), 10)
	if len(due) != 1 || due[0].EventID != "evt-1" {
		t.Fatalf("claim salah: %+v", due)
	}
	// Pesan dengan NextAttemptAt di masa depan tidak boleh diklaim sekarang,
	// tapi berhasil diklaim pada waktu yang sesuai.
	q.Retry(due[0], time.Hour, 20) // attempts 0 → 1 < 20 → dijadwalkan ulang
	if got := q.ClaimDue(time.Now().UTC(), 10); len(got) != 0 {
		t.Fatalf("pesan masa depan tidak boleh diklaim")
	}
	future := q.ClaimDue(time.Now().UTC().Add(2*time.Hour), 10)
	if len(future) != 1 || future[0].EventID != "evt-1" {
		t.Fatalf("pesan masa depan harus terklaim pada waktunya")
	}
	q.Ack("evt-1")
	if q.Len() != 0 {
		t.Fatalf("Len harus 0 setelah ack")
	}
	// Dedupe: redelivery event yang sama ditolak.
	if err := q.Enqueue(testMsg("evt-1")); !errors.Is(err, domain.ErrDuplicated) {
		t.Fatalf("redelivery harus ErrDuplicated, nyata %v", err)
	}
}

// TestPersistenceRoundtripPlain — muat ulang antrean tanpa enkripsi.
func TestPersistenceRoundtripPlain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "queue.json")
	q1, err := Open(path, "")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := q1.Enqueue(testMsg("evt-1")); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	q2, err := Open(path, "")
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if q2.Len() != 1 {
		t.Fatalf("pending harus bertahan saat reload: %d", q2.Len())
	}
	if got := q2.ClaimDue(time.Now().UTC(), 10); len(got) != 1 || got[0].EventID != "evt-1" {
		t.Fatalf("claim pasca reload salah: %+v", got)
	}
}

// TestPersistenceRoundtripEncrypted — antrean AES-256-GCM tervalidasi
// (file bukan plaintext, isi tetap benar).
func TestPersistenceRoundtripEncrypted(t *testing.T) {
	path := filepath.Join(t.TempDir(), "queue.json")
	q1, err := Open(path, testKeyHex)
	if err != nil {
		t.Fatalf("Open terenkripsi: %v", err)
	}
	if err := q1.Enqueue(testMsg("evt-2")); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	// File harus ber-envelope AES-GCM (bukan JSON pending plaintext).
	raw, err := osReadFile(path)
	if err != nil {
		t.Fatalf("baca file: %v", err)
	}
	if !bytes.Contains(raw, []byte("AES-256-GCM")) {
		t.Fatalf("antrean terenkripsi harus memakai envelope AES-256-GCM")
	}
	q2, err := Open(path, testKeyHex)
	if err != nil {
		t.Fatalf("reopen terenkripsi: %v", err)
	}
	if got := q2.ClaimDue(time.Now().UTC(), 10); len(got) != 1 || got[0].EventID != "evt-2" {
		t.Fatalf("claim pasca reload terenkripsi salah: %+v", got)
	}
	// Key salah → gagal dekripsi (autentikasi GCM).
	if _, err := Open(path, testKeyHex[:62]+"aa"); err == nil {
		t.Fatalf("key salah harus gagal dekripsi")
	}
}

// TestRetryDeadLetter — retry menambah attempts; habis percobaan → dead.
func TestRetryDeadLetter(t *testing.T) {
	q, err := Open(filepath.Join(t.TempDir(), "queue.json"), "")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := q.Enqueue(testMsg("evt-3")); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	msg := q.ClaimDue(time.Now().UTC().Add(10*time.Millisecond), 10)[0]
	for i := 0; i < 4; i++ {
		if !q.Retry(msg, time.Millisecond, 5) {
			t.Fatalf("iterasi %d masih harus retry", i)
		}
		due := q.ClaimDue(time.Now().UTC().Add(10*time.Millisecond), 10)
		if len(due) != 1 {
			t.Fatalf("pesan harus jatuh tempo lagi (delay 1ms)")
		}
		msg = due[0]
	}
	if q.Retry(msg, time.Millisecond, 5) {
		t.Fatalf("attempt ke-5 harus dead-letter (false)")
	}
	if q.DeadLettered() != 1 {
		t.Fatalf("DeadLettered harus 1, nyata %d", q.DeadLettered())
	}
	// Pesan dead-letter dihapus dari antrean — redelivery produsen boleh
	// memprosesnya ulang (dengan attempts kembali 0).
	if err := q.Enqueue(testMsg("evt-3")); err != nil {
		t.Fatalf("redelivery pasca dead-letter harus diterima, nyata %v", err)
	}
}

// TestInvalidMessage — invariant pesan divalidasi.
func TestInvalidMessage(t *testing.T) {
	q, err := Open(filepath.Join(t.TempDir(), "queue.json"), "")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	cases := []domain.OutboundMessage{
		{Event: "X"},               // tanpa event_id & channel
		{EventID: "a", Event: "X"}, // tanpa channel
		{EventID: "a", Channels: []domain.ChannelRef{{}}}, // tanpa event
		{EventID: "a", Event: "X", Channels: tooMany()},   // channel > 32
	}
	for i, m := range cases {
		if err := q.Enqueue(m); !errors.Is(err, domain.ErrInvalidMessage) {
			t.Fatalf("kasus %d harus ErrInvalidMessage, nyata %v", i, err)
		}
	}
}

// TestQueueFull — backpressure kapasitas hard.
func TestQueueFull(t *testing.T) {
	q, err := Open(filepath.Join(t.TempDir(), "queue.json"), "", WithMaxPending(16))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	for i := 0; i < 16; i++ {
		if err := q.Enqueue(testMsg("evt-" + itoa(i))); err != nil {
			t.Fatalf("enqueue ke-%d gagal: %v", i, err)
		}
	}
	if err := q.Enqueue(testMsg("evt-overflow")); !errors.Is(err, ErrQueueFull) {
		t.Fatalf("melebihi kapasitas harus ErrQueueFull, nyata %v", err)
	}
}

func tooMany() []domain.ChannelRef {
	out := make([]domain.ChannelRef, 33)
	for i := range out {
		out[i] = domain.ChannelRef{Type: domain.ChannelWebhook}
	}
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
