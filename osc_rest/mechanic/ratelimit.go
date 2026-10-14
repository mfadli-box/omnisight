package mechanic

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rlEntry struct {
	count int
	reset time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	entries map[string]*rlEntry
	max     int
	window  time.Duration
}

// RateLimit membatasi jumlah request per key (IP klien) dalam sebuah window
// tetap. Cocok untuk melindungi endpoint publik seperti login dari
// brute-force. Bersifat in-memory (per-instance).
func RateLimit(max int, window time.Duration) gin.HandlerFunc {
	rl := &rateLimiter{
		entries: map[string]*rlEntry{},
		max:     max,
		window:  window,
	}
	go rl.reap()
	return func(c *gin.Context) {
		if !rl.allow(c.ClientIP()) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"code":       "TOO_MANY_REQUESTS",
				"error":      "Too many requests, please try again later",
				"request_id": c.GetString("request_id"),
			})
			return
		}
		c.Next()
	}
}

func (rl *rateLimiter) allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	e := rl.entries[key]
	if e == nil || now.After(e.reset) {
		rl.entries[key] = &rlEntry{count: 1, reset: now.Add(rl.window)}
		return true
	}
	if e.count >= rl.max {
		return false
	}
	e.count++
	return true
}

func (rl *rateLimiter) reap() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		rl.mu.Lock()
		for k, e := range rl.entries {
			if now.After(e.reset) {
				delete(rl.entries, k)
			}
		}
		rl.mu.Unlock()
	}
}
