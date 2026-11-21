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
	return runPeriodic(ctx, w.Interval, w.Logger, "heartbeat", func(ctx context.Context) error {
		sample, err := w.Sampler.Sample(ctx)
		if err != nil {
			return err
		}
		return w.Sender.Heartbeat(ctx, sample)
	})
}

type TelemetryCollector interface {
	Collect(context.Context) (domain.HostMetrics, error)
}

type TelemetrySender interface {
	Telemetry(context.Context, domain.HostMetrics) error
}

type TelemetryWorker struct {
	Interval  time.Duration
	Collector TelemetryCollector
	Sender    TelemetrySender
	Logger    *slog.Logger
}

func (w TelemetryWorker) Run(ctx context.Context) error {
	return runPeriodic(ctx, w.Interval, w.Logger, "telemetry", func(ctx context.Context) error {
		sample, err := w.Collector.Collect(ctx)
		if err != nil {
			return err
		}
		return w.Sender.Telemetry(ctx, sample)
	})
}

func runPeriodic(ctx context.Context, interval time.Duration, logger *slog.Logger, event string, send func(context.Context) error) error {
	for ctx.Err() == nil {
		err := send(ctx)
		if ctx.Err() != nil {
			return nil
		}
		if err != nil {
			logger.WarnContext(ctx, event+"_failed", "error", err.Error())
		} else {
			logger.DebugContext(ctx, event+"_sent")
		}

		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
	}
	return nil
}
