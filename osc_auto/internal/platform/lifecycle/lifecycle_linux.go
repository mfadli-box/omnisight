//go:build linux

package lifecycle

import (
	"context"
	"os/signal"
	"syscall"
)

type Runner interface{ Run(context.Context) error }

func Run(name string, runner Runner) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	return runner.Run(ctx)
}
