package application

import (
	"context"
	"log/slog"
	"time"

	"omnisight/osc_auto/internal/domain"
)

type HeartbeatSender interface {
	Heartbeat(context.Context, domain.Telemetry) error
}

type HeartbeatWorker struct {
	Interval time.Duration
	Sampler  domain.Sampler
	Sender   HeartbeatSender
	Logger   *slog.Logger
}

func (w HeartbeatWorker) Run(ctx context.Context) error {
	for ctx.Err() == nil {
		sample, err := w.Sampler.Sample(ctx)
		if err == nil {
			err = w.Sender.Heartbeat(ctx, sample)
		}
		if ctx.Err() != nil {
			return nil
		}
		if err != nil {
			w.Logger.WarnContext(ctx, "heartbeat_failed", "error", err.Error())
		} else {
			w.Logger.DebugContext(ctx, "heartbeat_sent")
		}

		timer := time.NewTimer(w.Interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
	}
	return nil
}
