package rustapi

import (
	"testing"
)

// TestSignEnvelope — vektor tetap (dihitung independen): kunci + kanonis
// "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}" sesuai kontrak W2
// (osc_docs/rest/api-w2.md §Autentikasi HMAC agent).
func TestSignEnvelope(t *testing.T) {
	secret := []byte("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	body := []byte(`{"a":1}`)
	want := "81ae1598ccf0715e5344922108a16bba3b26c2f2851115226bc81190d97a7f40"

	got := SignEnvelope(secret, 1700000000, "POST", "/api/v1/agents/metrics/ingest", body)
	if got != want {
		t.Fatalf("signature tidak cocok: got=%s want=%s", got, want)
	}

	// Body berubah → signature berubah (integritas body terikat).
	other := SignEnvelope(secret, 1700000000, "POST", "/api/v1/agents/metrics/ingest", []byte(`{"a":2}`))
	if other == want {
		t.Fatal("signature harus sensitif terhadap body")
	}
	// Timestamp berubah → signature berubah (anti-replay).
	otherTs := SignEnvelope(secret, 1700000001, "POST", "/api/v1/agents/metrics/ingest", body)
	if otherTs == want {
		t.Fatal("signature harus sensitif terhadap timestamp")
	}
}

// TestUUIDv7 — format, versi, dan variant RFC 9562.
func TestUUIDv7(t *testing.T) {
	for i := 0; i < 100; i++ {
		id, err := uuidv7()
		if err != nil {
			t.Fatalf("uuidv7 error: %v", err)
		}
		if len(id) != 36 || id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
			t.Fatalf("format UUID salah: %s", id)
		}
		if id[14] != '7' {
			t.Fatalf("versi harus 7: %s", id)
		}
		if id[19] != '8' && id[19] != '9' && id[19] != 'a' && id[19] != 'b' {
			t.Fatalf("variant harus 10xx: %s", id)
		}
	}
}
