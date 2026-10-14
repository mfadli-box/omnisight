package mechanic

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

var encryptKey []byte

// InitCrypto memuat dan memvalidasi RE_SECRET. Gagal keras (fail-closed)
// bila secret tidak diset atau terlalu pendek — sistem TIDAK boleh berjalan
// dengan kunci default yang dapat diprediksi.
func InitCrypto() error {
	key := strings.TrimSpace(os.Getenv("RE_SECRET"))
	if key == "" {
		return errors.New("RE_SECRET is not set: refusing to start without an encryption secret")
	}
	b := []byte(key)
	if len(b) < 32 {
		return fmt.Errorf("RE_SECRET must be at least 32 bytes (got %d)", len(b))
	}
	encryptKey = b[:32]
	return nil
}

func getEncryptKey() ([]byte, error) {
	if encryptKey == nil {
		if err := InitCrypto(); err != nil {
			return nil, err
		}
	}
	return encryptKey, nil
}

func Encrypt(plaintext string) (string, error) {
	key, err := getEncryptKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes.NewCipher: %w", err)
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher.NewGCM: %w", err)
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("nonce: %w", err)
	}
	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func Decrypt(encoded string) (string, error) {
	key, err := getEncryptKey()
	if err != nil {
		return "", err
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes.NewCipher: %w", err)
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher.NewGCM: %w", err)
	}
	nonceSize := aesGCM.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(plaintext), nil
}
