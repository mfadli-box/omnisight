package mechanic

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"strings"
	"time"
)

// VerifyTOTP memverifikasi kode TOTP (RFC 6238, SHA1, 6 digit, 30 detik)
// terhadap secret base32 yang disimpan pengguna. Memberi toleransi ±1 langkah
// waktu untuk mengakomodasi perbedaan jam.
func VerifyTOTP(secret, code string) bool {
	secret = strings.ToUpper(strings.TrimSpace(strings.ReplaceAll(secret, " ", "")))
	code = strings.TrimSpace(code)
	if secret == "" || code == "" {
		return false
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return false
	}
	now := time.Now().Unix()
	for _, offset := range []int64{-1, 0, 1} {
		if subtle.ConstantTimeCompare([]byte(totpAt(key, now/30+offset)), []byte(code)) == 1 {
			return true
		}
	}
	return false
}

func totpAt(key []byte, counter int64) string {
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], uint64(counter))
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := (int32(sum[offset]&0x7f) << 24) |
		(int32(sum[offset+1]) << 16) |
		(int32(sum[offset+2]) << 8) |
		int32(sum[offset+3])
	otp := value % 1000000
	return fmt.Sprintf("%06d", otp)
}
