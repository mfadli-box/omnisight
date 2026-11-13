// Package snmp — klien SNMPv2c minimalis (GET saja) murni stdlib dengan
// encoder/decoder BER subset yang dibutuhkan: SEQUENCE, INTEGER, OCTET
// STRING, NULL, OID, Counter32/64, Gauge32, TimeTicks, dan tag konteks
// SNMP (GetRequest [0], GetResponse [1], NoSuchObject [128dst]).
//
// Desain: tanpa dependency eksternal agar lintas-platform & mudah diaudit.
// Hanya fitur yang dipakai agent: single GET multi-varbind v2c.
package snmp

import (
	"errors"
	"fmt"
)

// Tag ASN.1/BER yang dipakai.
const (
	tagInteger    = 0x02
	tagOctetStr   = 0x04
	tagNull       = 0x05
	tagSequence   = 0x30
	tagGauge32    = 0x42
	tagTimeTicks  = 0x43
	tagCounter32  = 0x41
	tagCounter64  = 0x46
	tagGetRequest = 0xA0
	tagGetResp    = 0xA1
	tagNoSuchObj  = 0x80
	tagNoSuchInst = 0x81
	tagEndOfMIB   = 0x82
)

// ErrBER — error encoding/decoding BER.
var ErrBER = errors.New("ber: format tidak valid")

// encodeTLV — TLV dengan length definite (panjang ≥ 128 → multi-byte).
func encodeTLV(tag byte, val []byte) []byte {
	out := []byte{tag}
	n := len(val)
	switch {
	case n < 0x80:
		out = append(out, byte(n))
	case n < 0x100:
		out = append(out, 0x81, byte(n))
	default:
		out = append(out, 0x82, byte(n>>8), byte(n&0xff))
	}
	return append(out, val...)
}

// encodeInt — INTEGER (dua's complement minimal encoding).
func encodeInt(v int64) []byte {
	switch {
	case v == 0:
		return encodeTLV(tagInteger, []byte{0})
	case v > 0:
		var buf [8]byte
		i := 8
		for v > 0 {
			i--
			buf[i] = byte(v)
			v >>= 8
		}
		// Pad 0x00 bila high-bit dari byte pertama terpasang (positif).
		if buf[i]&0x80 != 0 {
			i--
			buf[i] = 0
		}
		return encodeTLV(tagInteger, buf[i:])
	default:
		// Negatif: dua's complement panjang minimal.
		var buf [8]byte
		n := v
		i := 8
		for {
			i--
			buf[i] = byte(n)
			n >>= 8
			if n == -1 && buf[i]&0x80 != 0 {
				break
			}
			if n == 0 && buf[i]&0x80 == 0 {
				break
			}
		}
		return encodeTLV(tagInteger, buf[i:])
	}
}

// encodeUint — unsigned (Counter32/64 payload decoding terjadi di decode;
// fungsi ini dipakai untuk field int non-negatif bila diperlukan).
func encodeUint(v uint64) []byte {
	if v == 0 {
		return encodeTLV(tagInteger, []byte{0})
	}
	var buf [8]byte
	i := 8
	for v > 0 {
		i--
		buf[i] = byte(v)
		v >>= 8
	}
	if buf[i]&0x80 != 0 {
		i--
		buf[i] = 0
	}
	return encodeTLV(tagInteger, buf[i:])
}

// encodeOID — OBJECT IDENTIFIER (bytes: byte pertama = 40*a+b; sisanya
// base-128 dengan continuation bit).
func encodeOID(oid []int) ([]byte, error) {
	if len(oid) < 2 || oid[0] < 0 || oid[1] < 0 {
		return nil, fmt.Errorf("%w: OID minimal 2 subidentifier", ErrBER)
	}
	body := []byte{byte(oid[0]*40 + oid[1])}
	for _, sub := range oid[2:] {
		if sub < 0 {
			return nil, fmt.Errorf("%w: subidentifier negatif", ErrBER)
		}
		// Base-128, most-significant dulu (dibangun mundur).
		var tmp []byte
		tmp = append(tmp, byte(sub&0x7f))
		sub >>= 7
		for sub > 0 {
			tmp = append([]byte{byte(sub&0x7f) | 0x80}, tmp...)
			sub >>= 7
		}
		body = append(body, tmp...)
	}
	return encodeTLV(0x06, body), nil
}

// decodeLength membaca length definite dari posisi i; mengembalikan panjang
// dan offset setelah header length.
func decodeLength(b []byte, i int) (int, int, error) {
	if i >= len(b) {
		return 0, 0, fmt.Errorf("%w: length hilang", ErrBER)
	}
	first := int(b[i])
	i++
	switch {
	case first < 0x80:
		return first, i, nil
	case first == 0x80 || first == 0xFF:
		return 0, 0, fmt.Errorf("%w: length indefinite tidak didukung", ErrBER)
	case first == 0x81:
		if i+1 > len(b) {
			return 0, 0, fmt.Errorf("%w: length 1-byte terpotong", ErrBER)
		}
		return int(b[i]), i + 1, nil
	case first == 0x82:
		if i+2 > len(b) {
			return 0, 0, fmt.Errorf("%w: length 2-byte terpotong", ErrBER)
		}
		return int(b[i])<<8 | int(b[i+1]), i + 2, nil
	default:
		return 0, 0, fmt.Errorf("%w: length > 2 byte tidak didukung", ErrBER)
	}
}

// tlv satu elemen TLV hasil decode.
type tlv struct {
	tag  byte
	val  []byte
	rest []byte // sisa byte setelah elemen ini
}

// decodeTLV memecah satu elemen TLV dari depan.
func decodeTLV(b []byte) (tlv, error) {
	if len(b) < 2 {
		return tlv{}, fmt.Errorf("%w: elemen terlalu pendek", ErrBER)
	}
	tag := b[0]
	length, off, err := decodeLength(b, 1)
	if err != nil {
		return tlv{}, err
	}
	if off+length > len(b) {
		return tlv{}, fmt.Errorf("%w: nilai melebihi panjang buffer", ErrBER)
	}
	return tlv{tag: tag, val: b[off : off+length], rest: b[off+length:]}, nil
}

// decodeInt — INTEGER (signed, dua's complement).
func decodeInt(val []byte) (int64, error) {
	if len(val) == 0 || len(val) > 8 {
		return 0, fmt.Errorf("%w: INTEGER panjang %d", ErrBER, len(val))
	}
	var v int64
	if val[0]&0x80 != 0 {
		v = -1
	}
	for _, c := range val {
		v = v<<8 | int64(c)
	}
	return v, nil
}

// decodeUint — unsigned counter (berlaku untuk Counter32/64/Gauge).
func decodeUint(val []byte) (uint64, error) {
	if len(val) == 0 || len(val) > 8 {
		return 0, fmt.Errorf("%w: counter panjang %d", ErrBER, len(val))
	}
	var v uint64
	for _, c := range val {
		v = v<<8 | uint64(c)
	}
	return v, nil
}

// decodeOID — OBJECT IDENTIFIER → []int.
func decodeOID(val []byte) ([]int, error) {
	if len(val) == 0 {
		return nil, fmt.Errorf("%w: OID kosong", ErrBER)
	}
	oid := []int{int(val[0]) / 40, int(val[0]) % 40}
	v := 0
	reading := false
	for _, c := range val[1:] {
		v = v<<7 | int(c&0x7f)
		reading = true
		if c&0x80 == 0 {
			oid = append(oid, v)
			v = 0
			reading = false
		}
	}
	if reading {
		return nil, fmt.Errorf("%w: OID subidentifier terpotong", ErrBER)
	}
	return oid, nil
}
