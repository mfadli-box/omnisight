package collector

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

// Metrics contains host-wide, cumulative network counters and current resource use.
type Metrics struct {
	CPUPercent     float64 `json:"cpu_percent"`
	RAMUsedBytes   uint64  `json:"ram_used_bytes"`
	RAMPercent     float64 `json:"ram_percent"`
	DiskFreeBytes  uint64  `json:"disk_free_bytes"`
	NetworkRXBytes uint64  `json:"network_rx_bytes"`
	NetworkTXBytes uint64  `json:"network_tx_bytes"`
}

type Payload struct {
	AgentID   string    `json:"agent_id"`
	Timestamp time.Time `json:"timestamp"`
	Metrics   Metrics   `json:"metrics"`
}

// Collect measures the host. diskPath selects the filesystem to report.
func Collect(ctx context.Context, diskPath string) (Metrics, error) {
	if diskPath == "" {
		if runtime.GOOS == "windows" {
			diskPath = filepath.VolumeName(os.Getenv("SystemRoot")) + `\`
			if diskPath == `\` {
				diskPath = `C:\`
			}
		} else {
			diskPath = "/"
		}
	}
	// A short sample interval yields a real CPU percentage on the first collection.
	percent, err := cpu.PercentWithContext(ctx, time.Second, false)
	if err != nil || len(percent) == 0 {
		return Metrics{}, fmt.Errorf("collect CPU: %w", nonNil(err))
	}
	ram, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return Metrics{}, fmt.Errorf("collect RAM: %w", err)
	}
	storage, err := disk.UsageWithContext(ctx, diskPath)
	if err != nil {
		return Metrics{}, fmt.Errorf("collect disk: %w", err)
	}
	interfaces, err := net.IOCountersWithContext(ctx, true)
	if err != nil {
		return Metrics{}, fmt.Errorf("collect network: %w", err)
	}
	var rx, tx uint64
	for _, nic := range interfaces {
		// Loopback traffic does not represent host network traffic.
		if nic.Name == "lo" || strings.HasPrefix(strings.ToLower(nic.Name), "loopback") {
			continue
		}
		rx += nic.BytesRecv
		tx += nic.BytesSent
	}
	return Metrics{percent[0], ram.Used, ram.UsedPercent, storage.Free, rx, tx}, nil
}

func nonNil(err error) error {
	if err == nil {
		return errors.New("no CPU samples")
	}
	return err
}

// Signature returns lowercase hex HMAC-SHA256 over the exact transmitted body.
func Signature(body, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

type Sender struct {
	Endpoint string
	AgentID  string
	Secret   []byte
	Client   *http.Client
}

func (s Sender) Send(ctx context.Context, metrics Metrics) error {
	if s.AgentID == "" || len(s.Secret) == 0 {
		return errors.New("agent ID and secret are required")
	}
	u, err := url.Parse(s.Endpoint)
	if err != nil || u.Host == "" || u.Scheme != "https" || u.User != nil {
		return errors.New("telemetry endpoint must be an HTTPS URL without userinfo")
	}
	if u.RawQuery != "" || u.Fragment != "" {
		return errors.New("telemetry endpoint must not contain query or fragment")
	}
	body, err := json.Marshal(Payload{AgentID: s.AgentID, Timestamp: time.Now().UTC(), Metrics: metrics})
	if err != nil {
		return fmt.Errorf("encode telemetry: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.Endpoint, strings.NewReader(string(body)))
	if err != nil {
		return fmt.Errorf("prepare telemetry: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-Signature", Signature(body, s.Secret))
	client := s.Client
	if client == nil {
		client = &http.Client{}
	}
	boundedClient := *client
	if boundedClient.Timeout == 0 || boundedClient.Timeout > 10*time.Second {
		boundedClient.Timeout = 10 * time.Second
	}
	boundedClient.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	resp, err := boundedClient.Do(req)
	if err != nil {
		return fmt.Errorf("send telemetry: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("telemetry rejected: HTTP %d", resp.StatusCode)
	}
	return nil
}
