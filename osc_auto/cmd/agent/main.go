package main

import (
	"flag"
	"log/slog"
	"os"

	"omnisight/osc_auto/internal/application"
	"omnisight/osc_auto/internal/config"
	"omnisight/osc_auto/internal/infrastructure/httpapi"
	"omnisight/osc_auto/internal/infrastructure/jobs"
	"omnisight/osc_auto/internal/infrastructure/state"
	"omnisight/osc_auto/internal/infrastructure/telemetry"
	"omnisight/osc_auto/internal/platform/lifecycle"
)

func main() {
	configPath := flag.String("config", "./config.json", "path to agent configuration")
	flag.Parse()
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, key, err := config.Load(*configPath)
	if err != nil {
		logger.Error("agent_config_invalid", "error", err.Error())
		os.Exit(2)
	}
	store, err := state.Open(cfg.StateDir)
	if err != nil {
		logger.Error("agent_state_unavailable", "error", err.Error())
		os.Exit(2)
	}
	sampler := telemetry.NewSampler()
	api := httpapi.New(cfg.APIURL, cfg.NodeID, cfg.NodeToken)
	executor := application.NewJobExecutor(jobs.New(sampler), cfg.AllowedServices)
	agent := application.NewAgent(cfg.NodeID, cfg.Interval(), key, sampler, api, store, store, store, executor, logger)
	logger.Info("agent_starting", "node_id", cfg.NodeID)
	if err := lifecycle.Run("OmniSightAgent", agent); err != nil {
		logger.Error("agent_stopped_with_error", "error", err.Error())
		os.Exit(1)
	}
}
