package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"omnisight/osc_auto/internal/domain"
)

const (
	maxResponseBytes = 64 << 10
	maxRequestBytes  = 16 << 10
)

type Client struct {
	baseURL string
	nodeID  string
	token   string
	http    *http.Client
}

func New(baseURL, nodeID, token string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/") + "/agent/v1",
		nodeID:  nodeID,
		token:   token,
		http:    &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }},
	}
}

func (c *Client) Heartbeat(ctx context.Context, telemetry domain.Telemetry) error {
	_, err := c.request(ctx, http.MethodPost, "/heartbeat", telemetry, nil, true)
	return err
}

func (c *Client) Claim(ctx context.Context, nodeID string, sequence uint64) (*domain.JobEnvelope, error) {
	if nodeID != c.nodeID {
		return nil, errors.New("agent node identity mismatch")
	}
	body := struct {
		NodeID       string   `json:"node_id"`
		Sequence     uint64   `json:"sequence"`
		Capabilities []string `json:"capabilities"`
	}{NodeID: nodeID, Sequence: sequence, Capabilities: []string{"system.health", "service.status"}}
	response, err := c.request(ctx, http.MethodPost, "/jobs/claim", body, nil, true)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil {
		return nil, errors.New("read claim response failed")
	}
	if len(data) > maxResponseBytes {
		return nil, errors.New("claim response too large")
	}
	var wrapped struct {
		Data *domain.JobEnvelope `json:"data"`
	}
	if err := json.Unmarshal(data, &wrapped); err != nil {
		return nil, errors.New("claim response invalid")
	}
	return wrapped.Data, nil
}

func (c *Client) Report(ctx context.Context, result domain.JobResult) error {
	if result.NodeID != c.nodeID {
		return errors.New("agent result identity mismatch")
	}
	path := "/jobs/" + url.PathEscape(result.JobID) + "/result"
	_, err := c.request(ctx, http.MethodPost, path, result, map[string]string{"Idempotency-Key": result.JobID}, false)
	return err
}

func (c *Client) request(ctx context.Context, method, path string, input any, extra map[string]string, expectBody bool) (*http.Response, error) {
	var body []byte
	var err error
	if input != nil {
		body, err = json.Marshal(input)
		if err != nil || len(body) > maxRequestBytes {
			return nil, errors.New("agent request payload invalid or too large")
		}
	}
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		request, requestErr := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
		if requestErr != nil {
			return nil, errors.New("agent request could not be created")
		}
		request.Header.Set("Accept", "application/json")
		request.Header.Set("Authorization", "Bearer "+c.token)
		request.Header.Set("X-Node-ID", c.nodeID)
		if input != nil {
			request.Header.Set("Content-Type", "application/json")
		}
		for name, value := range extra {
			request.Header.Set(name, value)
		}
		response, doErr := c.http.Do(request)
		if doErr != nil {
			lastErr = errors.New("agent API request failed")
		} else if response.StatusCode == http.StatusConflict && method == http.MethodPost && extra["Idempotency-Key"] != "" {
			response.Body.Close()
			return &http.Response{StatusCode: http.StatusNoContent, Body: io.NopCloser(strings.NewReader(""))}, nil
		} else if response.StatusCode >= 500 || response.StatusCode == http.StatusTooManyRequests {
			response.Body.Close()
			lastErr = fmt.Errorf("agent API returned retryable status %d", response.StatusCode)
		} else if response.StatusCode < 200 || response.StatusCode >= 300 {
			response.Body.Close()
			return nil, fmt.Errorf("agent API returned status %d", response.StatusCode)
		} else {
			if !expectBody {
				response.Body.Close()
			}
			return response, nil
		}
		if attempt == 2 {
			break
		}
		timer := time.NewTimer(time.Duration(1<<attempt) * 250 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
	return nil, lastErr
}
