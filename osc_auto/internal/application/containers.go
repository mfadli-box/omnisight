package application

import (
	"context"
	"log/slog"
	"omnisight/osc_auto/internal/executor"
	"time"
)

type ContainerSender interface {
	Containers(context.Context, executor.Snapshot) error
}
type ContainerWorker struct {
	Docker executor.Docker
	Sender ContainerSender
	Logger *slog.Logger
}

func (w ContainerWorker) Run(ctx context.Context) error {
	return runPeriodic(ctx, 5*time.Minute, w.Logger, "container_inventory", func(ctx context.Context) error {
		ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		defer cancel()
		snapshot, err := w.Docker.Snapshot(ctx)
		if err != nil {
			return err
		}
		return w.Sender.Containers(ctx, snapshot)
	})
}
