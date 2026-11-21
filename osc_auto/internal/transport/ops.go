package transport

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"omnisight/osc_auto/internal/domain"
)

const claimPath = "/baas/v1/agents/ops/claim"
const eventPath = "/baas/v1/agents/ops/event"

func (c *Client) ClaimOps(ctx context.Context, compose bool) (*domain.OpsJob, error) {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return nil, err
	}
	nonce := hex.EncodeToString(random[:])
	response, err := c.post(ctx, claimPath, map[string]any{"nonce": nonce, "compose": compose})
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	const limit = 1024 << 10
	body, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || len(body) > limit {
		return nil, errors.New("OPS claim response is unreadable or too large")
	}
	var envelope struct {
		Payload   string `json:"payload"`
		Signature string `json:"signature"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, errors.New("OPS claim envelope is invalid")
	}
	signature, err := hex.DecodeString(envelope.Signature)
	if err != nil {
		return nil, errors.New("OPS claim signature is invalid")
	}
	mac := hmac.New(sha256.New, c.secret)
	_, _ = io.WriteString(mac, "osc:ops:job\n"+envelope.Payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return nil, errors.New("OPS claim signature does not match")
	}
	decoder := json.NewDecoder(bytes.NewBufferString(envelope.Payload))
	decoder.DisallowUnknownFields()
	var job domain.OpsJob
	if err := decoder.Decode(&job); err != nil {
		return nil, errors.New("OPS job payload is invalid")
	}
	var trailing any
	if !errors.Is(decoder.Decode(&trailing), io.EOF) {
		return nil, errors.New("OPS job payload contains trailing data")
	}
	now := time.Now()
	if job.ID == "" || job.NodeID != c.nodeID || strings.ReplaceAll(job.Nonce, "-", "") != nonce ||
		!job.ExpiresAt.After(now) || job.ExpiresAt.After(now.Add(7*time.Minute)) {
		return nil, errors.New("OPS job binding or deadline is invalid")
	}
	return &job, nil
}

func (c *Client) OpsOutput(ctx context.Context, jobID string, seq int, output string) error {
	return c.sendOpsEvent(ctx, map[string]any{"type": "output", "job_id": jobID, "seq": seq, "output": output})
}

func (c *Client) OpsDone(ctx context.Context, jobID string, success bool) error {
	return c.sendOpsEvent(ctx, map[string]any{"type": "done", "job_id": jobID, "success": success})
}

func (c *Client) sendOpsEvent(ctx context.Context, event any) error {
	var err error
	for range 2 {
		attempt, cancel := context.WithTimeout(ctx, 3*time.Second)
		err = c.send(attempt, eventPath, event)
		cancel()
		if err == nil || ctx.Err() != nil {
			return err
		}
	}
	return err
}
