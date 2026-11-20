package transport

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"omnisight/osc_auto/internal/domain"
)

const heartbeatPath = "/baas/v1/agents/heartbeat"

type Client struct {
	endpoint string
	nodeID   string
	secret   []byte
	http     *http.Client
}

func New(hubURL, nodeID, secret string) *Client {
	return &Client{
		endpoint: strings.TrimRight(hubURL, "/") + heartbeatPath,
		nodeID:   nodeID,
		secret:   []byte(secret),
		http: &http.Client{
			Timeout: 10 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

type heartbeat struct {
	OS            string  `json:"os"`
	UptimeSeconds uint64  `json:"uptime_seconds"`
	CPUPercent    float64 `json:"cpu_percent"`
	RAMPercent    float64 `json:"ram_percent"`
	DiskPercent   float64 `json:"disk_percent"`
}

func (c *Client) Heartbeat(ctx context.Context, sample domain.Telemetry) error {
	if sample.MemoryTotal == 0 || sample.DiskTotal == 0 ||
		sample.MemoryUsed > sample.MemoryTotal || sample.DiskUsed > sample.DiskTotal {
		return errors.New("heartbeat memory or disk counters are invalid")
	}
	body, err := json.Marshal(heartbeat{
		OS: sample.OS, UptimeSeconds: sample.UptimeSeconds, CPUPercent: sample.CPUPercent,
		RAMPercent:  100 * float64(sample.MemoryUsed) / float64(sample.MemoryTotal),
		DiskPercent: 100 * float64(sample.DiskUsed) / float64(sample.DiskTotal),
	})
	if err != nil {
		return errors.New("heartbeat payload is invalid")
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, c.secret)
	_, _ = io.WriteString(mac, c.nodeID+"\n"+timestamp+"\n")
	_, _ = mac.Write(body)

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.New("heartbeat request could not be created")
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Agent-Id", c.nodeID)
	request.Header.Set("X-Timestamp", timestamp)
	request.Header.Set("X-Signature", hex.EncodeToString(mac.Sum(nil)))
	response, err := c.http.Do(request)
	if err != nil {
		return errors.New("heartbeat request failed")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("heartbeat returned HTTP %d", response.StatusCode)
	}
	return nil
}
