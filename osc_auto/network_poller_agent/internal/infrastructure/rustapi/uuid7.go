package rustapi

import (
	"crypto/rand"
	"time"
)

// uuidv7 menghasilkan UUID versi 7 (time-ordered) sesuai RFC 9562:
// 48 bit unix-ms + 4 bit version(7) + 12 bit rand_a + 2 bit variant + 62 bit
// rand_b. Sumber keacakan crypto/rand (bukan math/rand).
func uuidv7() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	// unix_ms = 48 bit (overflow 8.808 tahun dari epoch — aman hingga 2157).
	ms := uint64(time.Now().UnixMilli())
	b[0] = byte(ms >> 40)
	b[1] = byte(ms >> 32)
	b[2] = byte(ms >> 24)
	b[3] = byte(ms >> 16)
	b[4] = byte(ms >> 8)
	b[5] = byte(ms)

	b[6] = (b[6] & 0x0f) | 0x70 // version 7
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10xx

	const hexDigits = "0123456789abcdef"
	dst := make([]byte, 0, 36)
	for i, v := range b {
		// Dash sebelum byte 4, 6, 8, 10 → kelompok 8-4-4-4-12 (posisi 8,13,18,23).
		switch i {
		case 4, 6, 8, 10:
			dst = append(dst, '-')
		}
		dst = append(dst, hexDigits[v>>4], hexDigits[v&0x0f])
	}
	return string(dst), nil
}
