//go:build !windows

package main

import (
	"context"
	"os/signal"
	"syscall"
)

func runService(parent context.Context) error {
	ctx, stop := signal.NotifyContext(parent, syscall.SIGTERM)
	defer stop()
	return run(ctx)
}
