package config

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const PollInterval = 5 * time.Minute

var (
	uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	codePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,20}$`)
)

const zeroUUID = "00000000-0000-0000-0000-000000000000"

// Tenant is the server-authorized assignment for one registered agent.
type Tenant struct {
	AgentID     string `json:"agent_id"`
	CompanyID   string `json:"company_id"`
	AreaID      string `json:"area_id"`
	StoreID     string `json:"store_id"`
	CompanyCode string `json:"company_code"`
	AreaCode    string `json:"area_code"`
}

func (t Tenant) valid(agentID string) bool {
	return t.AgentID == agentID && uuidPattern.MatchString(t.CompanyID) &&
		uuidPattern.MatchString(t.AreaID) && uuidPattern.MatchString(t.StoreID) &&
		t.CompanyID != zeroUUID && t.AreaID != zeroUUID && t.StoreID != zeroUUID &&
		codePattern.MatchString(t.CompanyCode) && codePattern.MatchString(t.AreaCode)
}

// Poller atomically replaces a tenant assignment only after a valid HTTPS response.
type Poller struct {
	Endpoint string
	AgentID  string
	Token    string
	Client   *http.Client

	mu        sync.RWMutex
	tenant    Tenant
	updatedAt time.Time
	interval  time.Duration
}

func (p *Poller) Refresh(ctx context.Context) error {
	u, err := url.Parse(p.Endpoint)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil ||
		u.RawQuery != "" || u.Fragment != "" || u.Path != "/api/v1/agent/tenant-context" {
		return errors.New("tenant context endpoint must be HTTPS /api/v1/agent/tenant-context")
	}
	if p.AgentID == "" || p.Token == "" || strings.ContainsAny(p.Token, "\r\n") {
		return errors.New("agent identity is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.Endpoint, nil)
	if err != nil {
		return errors.New("invalid tenant context request")
	}
	req.Header.Set("Authorization", "Bearer "+p.Token)
	req.Header.Set("X-Agent-ID", p.AgentID)
	client := p.Client
	if client == nil {
		client = &http.Client{}
	}
	bounded := *client
	if bounded.Timeout == 0 || bounded.Timeout > 10*time.Second {
		bounded.Timeout = 10 * time.Second
	}
	bounded.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := bounded.Do(req)
	if err != nil {
		return errors.New("tenant context request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("tenant context rejected: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4097))
	if err != nil || len(body) > 4096 {
		return errors.New("invalid tenant context response")
	}
	var tenant Tenant
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&tenant); err != nil {
		return errors.New("invalid tenant context response")
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF || !tenant.valid(p.AgentID) {
		return errors.New("invalid tenant context response")
	}
	p.mu.Lock()
	p.tenant = tenant
	p.updatedAt = time.Now()
	p.mu.Unlock()
	return nil
}

// Current rejects missing or stale assignments to prevent outdated tenant tags.
func (p *Poller) Current() (Tenant, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if p.updatedAt.IsZero() || time.Since(p.updatedAt) > 2*PollInterval {
		return Tenant{}, false
	}
	return p.tenant, true
}

// Run polls immediately and then every five minutes until cancellation.
func (p *Poller) Run(ctx context.Context, onError func(error)) {
	if err := p.Refresh(ctx); err != nil && ctx.Err() == nil && onError != nil {
		onError(err)
	}
	interval := PollInterval
	if p.interval > 0 {
		interval = p.interval
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := p.Refresh(ctx); err != nil && ctx.Err() == nil && onError != nil {
				onError(err)
			}
		}
	}
}
