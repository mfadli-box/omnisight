package snmp

import (
	"bytes"
	"testing"
)

// TestBuildGetRequest — struktur paket GetRequest v2c valid & ter-decode ulang.
func TestBuildGetRequest(t *testing.T) {
	oids := [][]int{{1, 3, 6, 1, 2, 1, 2, 2, 1, 10, 2}}
	pkt, err := buildGetRequest("public", oids)
	if err != nil {
		t.Fatalf("build: %v", err)
	}

	// Outer SEQUENCE.
	outer, err := decodeTLV(pkt)
	if err != nil {
		t.Fatalf("decode outer: %v", err)
	}
	if outer.tag != tagSequence {
		t.Fatalf("tag luar: 0x%02x", outer.tag)
	}
	version, err := decodeTLV(outer.val)
	if err != nil || version.tag != tagInteger {
		t.Fatalf("version salah: %v", err)
	}
	if v, err := decodeInt(version.val); err != nil || v != 1 {
		t.Fatalf("version harus 1 (v2c): %v %v", v, err)
	}

	community, err := decodeTLV(version.rest)
	if err != nil || community.tag != tagOctetStr || string(community.val) != "public" {
		t.Fatalf("community salah: %+v %v", community, err)
	}

	pdu, err := decodeTLV(community.rest)
	if err != nil || pdu.tag != tagGetRequest {
		t.Fatalf("pdu salah: %+v %v", pdu, err)
	}

	// Walk PDU: request-id, error-status, error-index, varbind-list.
	reqID, err := decodeTLV(pdu.val)
	if err != nil {
		t.Fatalf("req-id: %v", err)
	}
	errSt, err := decodeTLV(reqID.rest)
	if err != nil {
		t.Fatalf("err-status: %v", err)
	}
	if v, err := decodeInt(errSt.val); err != nil || v != 0 {
		t.Fatalf("error-status harus 0: %v %v", v, err)
	}
	errIdx, err := decodeTLV(errSt.rest)
	if err != nil {
		t.Fatalf("err-index: %v", err)
	}
	vbl, err := decodeTLV(errIdx.rest)
	if err != nil || vbl.tag != tagSequence {
		t.Fatalf("varbind-list salah: %v", err)
	}
	vb, err := decodeTLV(vbl.val)
	if err != nil {
		t.Fatalf("varbind: %v", err)
	}
	oidTlv, err := decodeTLV(vb.val)
	if err != nil || oidTlv.tag != 0x06 {
		t.Fatalf("oid salah: %v", err)
	}
	gotOID, err := decodeOID(oidTlv.val)
	if err != nil {
		t.Fatalf("decode oid: %v", err)
	}
	if !intsEqual(gotOID, oids[0]) {
		t.Fatalf("OID tidak round-trip: got=%v want=%v", gotOID, oids[0])
	}
	// Nil varbind NULL.
	nullTlv, err := decodeTLV(oidTlv.rest)
	if err != nil || nullTlv.tag != tagNull || len(nullTlv.val) != 0 {
		t.Fatalf("varbind value harus NULL: %+v %v", nullTlv, err)
	}
}

// TestParseResponse — respons GetResponse dengan Counter64 ter-decode benar.
func TestParseResponse(t *testing.T) {
	// Susun respons sintetis: SEQUENCE{INT 1, OCTET "public",
	// GetResponse{INT 1, INT 0, INT 0, SEQUENCE{VARBIND{OID ifHCInOctets.2,
	// Counter64 1234567890}, VARBIND{OID, INTEGER 42}}}}
	oid1, _ := encodeOID([]int{1, 3, 6, 1, 2, 1, 31, 1, 1, 1, 6, 2})
	oid2, _ := encodeOID([]int{1, 3, 6, 1, 2, 1, 2, 1, 1})

	var vbl []byte
	vb1 := append(append([]byte{}, oid1...), encodeTLV(tagCounter64, []byte{0x49, 0x96, 0x02, 0xD2})...)
	vbl = append(vbl, encodeTLV(tagSequence, vb1)...)
	vb2 := append(append([]byte{}, oid2...), encodeInt(42)...)
	vbl = append(vbl, encodeTLV(tagSequence, vb2)...)

	pdu := append([]byte{}, encodeInt(7)...) // request-id
	pdu = append(pdu, encodeInt(0)...)
	pdu = append(pdu, encodeInt(0)...)
	pdu = append(pdu, encodeTLV(tagSequence, vbl)...)
	pdu = encodeTLV(tagGetResp, pdu)

	body := append([]byte{}, encodeInt(1)...)
	body = append(body, encodeTLV(tagOctetStr, []byte("public"))...)
	body = append(body, pdu...)

	resp := encodeTLV(tagSequence, body)
	vbs, err := parseResponse(resp)
	if err != nil {
		t.Fatalf("parseResponse: %v", err)
	}
	if len(vbs) != 2 {
		t.Fatalf("harus 2 varbind, dapat %d", len(vbs))
	}
	if !intsEqual(vbs[0].OID, []int{1, 3, 6, 1, 2, 1, 31, 1, 1, 1, 6, 2}) {
		t.Fatalf("OID 1 salah: %v", vbs[0].OID)
	}
	if v, err := vbs[0].Uint(); err != nil || v != 1234567890 {
		t.Fatalf("Counter64 salah: %v %v", v, err)
	}
	if v, err := vbs[1].Int(); err != nil || v != 42 {
		t.Fatalf("INTEGER salah: %v %v", v, err)
	}
}

// TestParseResponseErrorStatus — error-status ≠ 0 → error.
func TestParseResponseErrorStatus(t *testing.T) {
	oid1, _ := encodeOID([]int{1, 3, 6, 1, 2, 1})
	vb := append(append([]byte{}, oid1...), encodeTLV(tagNull, nil)...)
	vbl := encodeTLV(tagSequence, vb)
	pdu := append([]byte{}, encodeInt(1)...)
	pdu = append(pdu, encodeInt(2)...) // error-status = 2 (noSuchName)
	pdu = append(pdu, encodeInt(1)...)
	pdu = append(pdu, encodeTLV(tagSequence, vbl)...)
	body := append(encodeInt(1), encodeTLV(tagOctetStr, []byte("public"))...)
	body = append(body, encodeTLV(tagGetResp, pdu)...)
	resp := encodeTLV(tagSequence, body)
	if _, err := parseResponse(resp); err == nil {
		t.Fatal("error-status ≠ 0 harus error")
	}
}

// TestEncodeIntEdgeCases — batas nilai.
func TestEncodeIntEdgeCases(t *testing.T) {
	if got := encodeInt(0); !bytes.Equal(got, []byte{0x02, 0x01, 0x00}) {
		t.Fatalf("encodeInt(0) salah: % x", got)
	}
	if got := encodeInt(127); !bytes.Equal(got, []byte{0x02, 0x01, 0x7f}) {
		t.Fatalf("encodeInt(127) salah: % x", got)
	}
	// 128 butuh padding 0x00 (positif).
	if got := encodeInt(128); !bytes.Equal(got, []byte{0x02, 0x02, 0x00, 0x80}) {
		t.Fatalf("encodeInt(128) salah: % x", got)
	}
	if got := encodeInt(-1); !bytes.Equal(got, []byte{0x02, 0x01, 0xff}) {
		t.Fatalf("encodeInt(-1) salah: % x", got)
	}
	// -128 → satu byte 0x80.
	if got := encodeInt(-128); !bytes.Equal(got, []byte{0x02, 0x01, 0x80}) {
		t.Fatalf("encodeInt(-128) salah: % x", got)
	}
	// -129 → dua byte 0xff 0x7f.
	if got := encodeInt(-129); !bytes.Equal(got, []byte{0x02, 0x02, 0xff, 0x7f}) {
		t.Fatalf("encodeInt(-129) salah: % x", got)
	}
}

func intsEqual(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
