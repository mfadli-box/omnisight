// Klien SNMPv2c GET (murni stdlib, tanpa CGO — aman cross-compile).
package snmp

import (
	"context"
	"crypto/rand"
	"fmt"
	"net"
	"time"
)

// Client klien SNMP UDP.
type Client struct {
	timeout time.Duration
}

// New membangun klien dengan timeout per request.
func New(timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	return &Client{timeout: timeout}
}

// VarBind hasil decode satu varbind respons.
type VarBind struct {
	OID   []int
	Tag   byte
	Value []byte
}

// Uint mengembalikan nilai sebagai unsigned (Counter/Gauge).
func (vb VarBind) Uint() (uint64, error) { return decodeUint(vb.Value) }

// Int mengembalikan nilai sebagai signed integer.
func (vb VarBind) Int() (int64, error) { return decodeInt(vb.Value) }

// String mengembalikan nilai OCTET STRING.
func (vb VarBind) String() string { return string(vb.Value) }

// Get melakukan SNMPv2c GET untuk daftar OID; mengembalikan varbind urut
// sesuai respons. requestID acak (crypto/rand); community diteruskan
// apa adanya dan tidak pernah di-log oleh pemanggil.
func (c *Client) Get(ctx context.Context, host, community string, oids [][]int) ([]VarBind, error) {
	if len(oids) == 0 {
		return nil, nil
	}
	packet, err := buildGetRequest(community, oids)
	if err != nil {
		return nil, err
	}

	dialer := net.Dialer{}
	conn, err := dialer.DialContext(ctx, "udp", net.JoinHostPort(host, "161"))
	if err != nil {
		return nil, fmt.Errorf("snmp dial %s: %w", host, err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(c.timeout))

	if _, err := conn.Write(packet); err != nil {
		return nil, fmt.Errorf("snmp kirim: %w", err)
	}
	buf := make([]byte, 65535)
	n, err := conn.Read(buf)
	if err != nil {
		return nil, fmt.Errorf("snmp terima: %w", err)
	}
	return parseResponse(buf[:n])
}

// buildGetRequest menyusun paket GetRequest v2c.
func buildGetRequest(community string, oids [][]int) ([]byte, error) {
	// request-id acak.
	var rb [4]byte
	if _, err := rand.Read(rb[:]); err != nil {
		return nil, fmt.Errorf("snmp request-id: %w", err)
	}
	reqID := encodeUint(uint64(uint32(rb[0])<<24 | uint32(rb[1])<<16 | uint32(rb[2])<<8 | uint32(rb[3])))

	pdu := append([]byte{}, reqID...)
	pdu = append(pdu, encodeInt(0)...) // error-status = 0
	pdu = append(pdu, encodeInt(0)...) // error-index = 0

	var vbl []byte
	for _, oid := range oids {
		enc, err := encodeOID(oid)
		if err != nil {
			return nil, err
		}
		vb := append(append([]byte{}, enc...), encodeTLV(tagNull, nil)...)
		vbl = append(vbl, encodeTLV(tagSequence, vb)...)
	}
	pdu = append(pdu, encodeTLV(tagSequence, vbl)...) // varbind-list
	pdu = encodeTLV(tagGetRequest, pdu)

	body := append([]byte{}, encodeInt(1)...) // version = 1 (v2c)
	body = append(body, encodeTLV(tagOctetStr, []byte(community))...)
	body = append(body, pdu...)
	return encodeTLV(tagSequence, body), nil
}

// parseResponse memecahkan GetResponse; error-status ≠ 0 → error.
func parseResponse(b []byte) ([]VarBind, error) {
	outer, err := decodeTLV(b)
	if err != nil {
		return nil, err
	}
	if outer.tag != tagSequence {
		return nil, fmt.Errorf("%w: tag luar 0x%02x (harap SEQUENCE)", ErrBER, outer.tag)
	}
	versionTlv, err := decodeTLV(outer.val)
	if err != nil {
		return nil, err
	}
	if _, err := decodeInt(versionTlv.val); err != nil {
		return nil, fmt.Errorf("%w: version: %v", ErrBER, err)
	}

	restTlv, err := decodeTLV(versionTlv.rest)
	if err != nil {
		return nil, err
	}
	_ = restTlv // community (abaikan isi — tidak di-log)

	pduTlv, err := decodeTLV(restTlv.rest)
	if err != nil {
		return nil, err
	}
	if pduTlv.tag != tagGetResp {
		return nil, fmt.Errorf("%w: tag PDU 0x%02x (harap GetResponse)", ErrBER, pduTlv.tag)
	}

	reqIDTlv, err := decodeTLV(pduTlv.val)
	if err != nil {
		return nil, err
	}
	_ = reqIDTlv
	errStatusTlv, err := decodeTLV(reqIDTlv.rest)
	if err != nil {
		return nil, err
	}
	errStatus, err := decodeInt(errStatusTlv.val)
	if err != nil {
		return nil, err
	}
	if errStatus != 0 {
		return nil, fmt.Errorf("snmp error-status %d", errStatus)
	}
	errIdxTlv, err := decodeTLV(errStatusTlv.rest)
	if err != nil {
		return nil, err
	}
	_ = errIdxTlv

	vblTlv, err := decodeTLV(errIdxTlv.rest)
	if err != nil {
		return nil, err
	}
	if vblTlv.tag != tagSequence {
		return nil, fmt.Errorf("%w: varbind-list bukan SEQUENCE", ErrBER)
	}

	var out []VarBind
	rest := vblTlv.val
	for len(rest) > 0 {
		vbTlv, err := decodeTLV(rest)
		if err != nil {
			return nil, err
		}
		rest = vbTlv.rest
		oidTlv, err := decodeTLV(vbTlv.val)
		if err != nil {
			return nil, err
		}
		if oidTlv.tag != 0x06 {
			return nil, fmt.Errorf("%w: varbind[0] bukan OID", ErrBER)
		}
		oid, err := decodeOID(oidTlv.val)
		if err != nil {
			return nil, err
		}
		valTlv, err := decodeTLV(oidTlv.rest)
		if err != nil {
			return nil, err
		}
		switch valTlv.tag {
		case tagNoSuchObj, tagNoSuchInst, tagEndOfMIB:
			return nil, fmt.Errorf("snmp: %s", mapTag(valTlv.tag))
		}
		out = append(out, VarBind{OID: oid, Tag: valTlv.tag, Value: valTlv.val})
	}
	return out, nil
}

func mapTag(tag byte) string {
	switch tag {
	case tagNoSuchObj:
		return "noSuchObject"
	case tagNoSuchInst:
		return "noSuchInstance"
	case tagEndOfMIB:
		return "endOfMibView"
	}
	return fmt.Sprintf("tag 0x%02x", tag)
}
