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
const telemetryPath = "/baas/v1/agents/telemetry"

type Client struct {
	hubURL string
	nodeID string
	secret []byte
	http   *http.Client
}

func New(hubURL, nodeID, secret string) *Client {
	return &Client{
		hubURL: strings.TrimRight(hubURL, "/"),
		nodeID: nodeID,
		secret: []byte(secret),
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
	return c.send(ctx, heartbeatPath, heartbeat{
		OS: sample.OS, UptimeSeconds: sample.UptimeSeconds, CPUPercent: sample.CPUPercent,
		RAMPercent:  100 * float64(sample.MemoryUsed) / float64(sample.MemoryTotal),
		DiskPercent: 100 * float64(sample.DiskUsed) / float64(sample.DiskTotal),
	})
}

func (c *Client) Telemetry(ctx context.Context, sample domain.HostMetrics) error {
	return c.send(ctx, telemetryPath, sample)
}

func (c *Client) send(ctx context.Context, path string, payload any) error {
	response, err := c.post(ctx, path, payload)
	if err != nil {
		return err
	}
	return response.Body.Close()
}

func (c *Client) post(ctx context.Context, path string, payload any) (*http.Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, errors.New("agent payload is invalid")
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, c.secret)
	if path != heartbeatPath {
		_, _ = io.WriteString(mac, path+"\n")
	}
	_, _ = io.WriteString(mac, c.nodeID+"\n"+timestamp+"\n")
	_, _ = mac.Write(body)

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.hubURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("agent request could not be created")
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Agent-Id", c.nodeID)
	request.Header.Set("X-Timestamp", timestamp)
	request.Header.Set("X-Signature", hex.EncodeToString(mac.Sum(nil)))
	response, err := c.http.Do(request)
	if err != nil {
		return nil, errors.New("agent request failed")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_ = response.Body.Close()
		return nil, fmt.Errorf("agent endpoint returned HTTP %d", response.StatusCode)
	}
	return response, nil
}
