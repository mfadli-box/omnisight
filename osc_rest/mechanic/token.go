package mechanic

import (
	"crypto/sha256"
	"encoding/hex"
)

// HashToken mengembalikan SHA-256 hex dari token.
func HashToken(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
