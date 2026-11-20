package application

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
	"time"

	"omnisight/osc_auto/internal/domain"
)

func VerifyAndDecode(envelope domain.JobEnvelope, key []byte, nodeID string, now time.Time) (domain.Job, error) {
	if len(envelope.Payload) == 0 || len(envelope.Payload) > domain.MaxJobBytes || len(key) < 32 {
		return domain.Job{}, errors.New("signed job has invalid size or key")
	}
	signature, err := hex.DecodeString(envelope.Signature)
	if err != nil || len(signature) != sha256.Size {
		return domain.Job{}, errors.New("signed job signature encoding invalid")
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(envelope.Payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return domain.Job{}, errors.New("signed job signature invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(envelope.Payload))
	decoder.DisallowUnknownFields()
	var job domain.Job
	if err := decoder.Decode(&job); err != nil {
		return domain.Job{}, fmt.Errorf("signed job payload invalid: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return domain.Job{}, errors.New("signed job payload contains trailing data")
	}
	if err := job.Validate(now, nodeID); err != nil {
		return domain.Job{}, err
	}
	return job, nil
}

type JobExecutor struct {
	runner   domain.JobRunner
	services map[string]struct{}
}

func NewJobExecutor(runner domain.JobRunner, allowedServices []string) *JobExecutor {
	services := make(map[string]struct{}, len(allowedServices))
	for _, service := range allowedServices {
		services[service] = struct{}{}
	}
	return &JobExecutor{runner: runner, services: services}
}

func (e *JobExecutor) Execute(ctx context.Context, job domain.Job) (string, error) {
	return e.execute(ctx, job, true)
}

func (e *JobExecutor) ExecuteDiagnostic(ctx context.Context, job domain.Job) (string, error) {
	return e.execute(ctx, job, false)
}

func (e *JobExecutor) execute(ctx context.Context, job domain.Job, legacy bool) (string, error) {
	if !legacy && (job.Command == "system.health" || job.Command == "service.status") {
		return "", errors.New("command is not in the local allowlist")
	}
	switch job.Command {
	case "system.health", "uptime", "df", "docker ps":
		if len(job.Args) != 0 {
			return "", errors.New("command does not accept arguments")
		}
	case "service.status", "systemctl status":
		if len(job.Args) != 1 || job.Args["service"] == "" {
			return "", errors.New("service status requires one service name")
		}
		if _, allowed := e.services[job.Args["service"]]; !allowed {
			return "", errors.New("service is not in the local allowlist")
		}
	default:
		return "", errors.New("command is not in the local allowlist")
	}
	output, err := e.runner.Run(ctx, job.Command, job.Args)
	result := domain.JobResult{Output: output}
	result.BoundOutput()
	return result.Output, err
}
