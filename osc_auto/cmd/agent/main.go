package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"omnisight/osc_auto/src/collector"
)

func run(ctx context.Context) error {
	endpoint := os.Getenv("OMNISIGHT_TELEMETRY_URL")
	if endpoint == "" {
		return fmt.Errorf("OMNISIGHT_TELEMETRY_URL is required")
	}
	identityCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	identity, err := resolveIdentity(identityCtx)
	cancel()
	if err != nil {
		return fmt.Errorf("resolve agent identity: %w", err)
	}
	sender := collector.Sender{Endpoint: endpoint, AgentID: identity.AgentID, Secret: []byte(identity.AgentToken)}
	collectAndSend := func() {
		requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		metrics, err := collector.Collect(requestCtx, os.Getenv("OMNISIGHT_DISK_PATH"))
		if err == nil {
			err = sender.Send(requestCtx, metrics)
		}
		if err != nil && ctx.Err() == nil {
			log.Printf("telemetry cycle failed: %v", err)
		}
	}
	collectAndSend()
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			collectAndSend()
		}
	}
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := runService(ctx); err != nil {
		log.Printf("agent stopped: %v", err)
		os.Exit(1)
	}
}
