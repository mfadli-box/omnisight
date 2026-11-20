//go:build !linux && !windows

package lifecycle

import (
	"context"
	"os/signal"
)

type Runner interface{ Run(context.Context) error }

func Run(_ string, runner Runner) error {
	ctx, stop := signal.NotifyContext(context.Background())
	defer stop()
	return runner.Run(ctx)
}
