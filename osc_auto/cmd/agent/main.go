package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"omnisight/osc_auto/internal/application"
	"omnisight/osc_auto/internal/collector"
	"omnisight/osc_auto/internal/config"
	"omnisight/osc_auto/internal/domain"
	"omnisight/osc_auto/internal/executor"
	"omnisight/osc_auto/internal/infrastructure/httpapi"
	"omnisight/osc_auto/internal/infrastructure/jobs"
	"omnisight/osc_auto/internal/infrastructure/state"
	"omnisight/osc_auto/internal/infrastructure/telemetry"
	"omnisight/osc_auto/internal/platform/lifecycle"
	"omnisight/osc_auto/internal/transport"
)

func main() {
	configPath := flag.String("config", config.DefaultPath, "path to agent YAML or legacy JSON configuration")
	command := flag.String("command", "", "run an allowlisted local diagnostic once")
	service := flag.String("service", "", "locally allowlisted service name for a status diagnostic")
	flag.Parse()
	if flag.NArg() != 0 || (*command == "" && *service != "") {
		flag.Usage()
		os.Exit(2)
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	if code := run(*configPath, *command, *service, logger); code != 0 {
		os.Exit(code)
	}
}

func run(path, command, service string, logger *slog.Logger) int {
	if path == config.DefaultPath {
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) && !hasHeartbeatEnv() {
			if _, err := os.Stat("config.json"); err == nil {
				path = "config.json"
			}
		}
	}

	sampler := telemetry.NewSampler()
	var nodeID string
	var runner lifecycle.Runner
	var diagnostics *application.JobExecutor
	if config.IsLegacy(path) {
		cfg, key, err := config.Load(path)
		if err != nil {
			logger.Error("agent_config_invalid", "error", err.Error())
			return 2
		}
		nodeID = cfg.NodeID
		diagnostics = application.NewJobExecutor(jobs.New(sampler), cfg.AllowedServices)
		if command == "" {
			store, err := state.Open(cfg.StateDir)
			if err != nil {
				logger.Error("agent_state_unavailable", "error", err.Error())
				return 2
			}
			api := httpapi.New(cfg.APIURL, nodeID, cfg.NodeToken)
			runner = application.NewAgent(nodeID, cfg.Interval(), key, sampler, api, store, store, store, diagnostics, logger)
		}
	} else {
		cfg, err := config.LoadHeartbeat(path)
		if err != nil {
			logger.Error("agent_config_invalid", "error", err.Error())
			return 2
		}
		nodeID = cfg.NodeID
		diagnostics = application.NewJobExecutor(jobs.New(sampler), cfg.AllowedServices)
		client := transport.New(cfg.HubURL, nodeID, cfg.AgentSecret)
		if cfg.TelemetryEnabled {
			runner = application.TelemetryWorker{
				Interval: cfg.Interval(), Collector: collector.Collector{Sampler: sampler},
				Sender: client, Logger: logger,
			}
		} else {
			runner = application.HeartbeatWorker{
				Interval: cfg.Interval(), Sampler: sampler, Sender: client, Logger: logger,
			}
		}
		if cfg.OpsEnabled {
			docker := executor.Docker{}
			ops := application.OpsWorker{
				Docker: &docker,
				API:    client, Executor: diagnostics, DockerStatus: executor.DockerStatus, Logger: logger,
			}
			if cfg.ComposeRoot != "" {
				ops.Compose = executor.Compose{Root: cfg.ComposeRoot}
			}
			runner = workers{monitor: runner, ops: ops, containers: application.ContainerWorker{Docker: docker, Sender: client, Logger: logger}}
		}
	}
	if command != "" {
		job := domain.Job{Command: command}
		if service != "" {
			job.Args = map[string]string{"service": service}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		output, err := diagnostics.ExecuteDiagnostic(ctx, job)
		if output != "" {
			fmt.Println(output)
		}
		if err != nil {
			logger.Error("agent_command_failed", "error", err.Error())
			return 1
		}
		return 0
	}
	logger.Info("agent_starting", "node_id", nodeID)
	if err := lifecycle.Run("OmniSightAgent", runner); err != nil {
		logger.Error("agent_stopped_with_error", "error", err.Error())
		return 1
	}
	return 0
}

func hasHeartbeatEnv() bool {
	for _, name := range []string{"HUB_URL", "NODE_ID", "AGENT_SECRET", "POLL_INTERVAL_SEC", "TELEMETRY_ENABLED", "OPS_ENABLED", "COMPOSE_ROOT"} {
		if _, ok := os.LookupEnv(name); ok {
			return true
		}
	}
	return false
}

type workers struct {
	monitor    lifecycle.Runner
	ops        lifecycle.Runner
	containers lifecycle.Runner
}

func (w workers) Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	result := make(chan error, 2)
	go func() { result <- w.ops.Run(ctx); cancel() }()
	go func() { result <- w.containers.Run(ctx); cancel() }()
	err := w.monitor.Run(ctx)
	cancel()
	return errors.Join(err, <-result, <-result)
}
