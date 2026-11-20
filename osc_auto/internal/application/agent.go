package application

import (
	"context"
	"log/slog"
	"time"

	"omnisight/osc_auto/internal/domain"
)

type Agent struct {
	nodeID   string
	interval time.Duration
	jobKey   []byte
	sampler  domain.Sampler
	api      domain.AgentAPI
	sequence domain.SequenceStore
	replay   domain.ReplayStore
	queue    domain.ResultQueue
	executor *JobExecutor
	logger   *slog.Logger
}

func NewAgent(nodeID string, interval time.Duration, jobKey []byte, sampler domain.Sampler, api domain.AgentAPI, sequence domain.SequenceStore, replay domain.ReplayStore, queue domain.ResultQueue, executor *JobExecutor, logger *slog.Logger) *Agent {
	return &Agent{nodeID: nodeID, interval: interval, jobKey: append([]byte(nil), jobKey...), sampler: sampler, api: api, sequence: sequence, replay: replay, queue: queue, executor: executor, logger: logger}
}

func (a *Agent) Run(ctx context.Context) error {
	if err := a.cycle(ctx); err != nil && ctx.Err() == nil {
		a.logger.WarnContext(ctx, "agent_cycle_failed", "error", err.Error())
	}
	ticker := time.NewTicker(a.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := a.cycle(ctx); err != nil && ctx.Err() == nil {
				a.logger.WarnContext(ctx, "agent_cycle_failed", "error", err.Error())
			}
		}
	}
}

func (a *Agent) cycle(ctx context.Context) error {
	if err := a.flushResults(ctx); err != nil {
		return err
	}
	telemetry, err := a.sampler.Sample(ctx)
	if err != nil {
		return err
	}
	sequence, err := a.sequence.Next()
	if err != nil {
		return err
	}
	telemetry.NodeID, telemetry.Sequence = a.nodeID, sequence
	telemetry.CollectedAt = time.Now().UTC()
	if err := telemetry.Validate(); err != nil {
		return err
	}
	if err := a.api.Heartbeat(ctx, telemetry); err != nil {
		return err
	}
	envelope, err := a.api.Claim(ctx, a.nodeID, sequence)
	if err != nil || envelope == nil {
		return err
	}
	job, err := VerifyAndDecode(*envelope, a.jobKey, a.nodeID, time.Now())
	if err != nil {
		a.logger.WarnContext(ctx, "job_rejected", "reason", err.Error())
		return nil
	}
	if err := a.replay.Consume(job.Nonce, job.JobID, time.Unix(job.ExpiresAt, 0), time.Now()); err != nil {
		a.logger.WarnContext(ctx, "job_replay_rejected", "job_id", job.JobID)
		return nil
	}
	started := time.Now().UTC()
	result := domain.JobResult{NodeID: a.nodeID, JobID: job.JobID, Nonce: job.Nonce, Status: "running", StartedAt: started, FinishedAt: started}
	if err := a.queue.Enqueue(result); err != nil {
		return err
	}
	jobCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	output, runErr := a.executor.Execute(jobCtx, job)
	cancel()
	result.FinishedAt = time.Now().UTC()
	result.Output = output
	if runErr != nil {
		result.Status = "failed"
		if result.Output == "" {
			result.Output = "allowlisted healthcheck failed"
		}
	} else {
		result.Status = "succeeded"
	}
	result.BoundOutput()
	if err := a.queue.Update(result); err != nil {
		return err
	}
	return a.flushResults(ctx)
}

func (a *Agent) flushResults(ctx context.Context) error {
	for count := 0; count < 100; count++ {
		result, exists, err := a.queue.Peek()
		if err != nil {
			return err
		}
		if !exists {
			return nil
		}
		if result.Status == "running" {
			result.Status = "failed"
			result.Output = "agent restarted before job completion"
			result.FinishedAt = time.Now().UTC()
			if err := a.queue.Update(result); err != nil {
				return err
			}
		}
		if err := a.api.Report(ctx, result); err != nil {
			return err
		}
		if err := a.queue.Remove(result.JobID); err != nil {
			return err
		}
	}
	return nil
}
