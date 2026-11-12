// agent_cs — agent latar belakang omnisight (boilerplate Clean Architecture).
//
// Mode eksekusi:
//   - Linux (systemd)  : berjalan foreground (Type=simple), stop via
//     SIGINT/SIGTERM dari systemd.
//   - Windows          : otomatis terdeteksi SCM (Windows Service) atau
//     console; --run-console memaksa mode console.
//   - --once           : jalankan satu siklus probe lalu keluar (debug).
//   - --version        : tampilkan versi.
//
// Konfigurasi via environment variables (lihat configs/agent_cs.env.example).
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/delivery"
	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/infrastructure/platform"
	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/infrastructure/rustapi"
	"github.com/mfadli-box/omnisight/osc_auto/agent_cs/internal/usecase"
)

const version = "0.1.0"

type config struct {
	rustBaseURL string
	rustToken   string
	interval    time.Duration
	logLevel    slog.Level
}

func loadConfig() (config, error) {
	cfg := config{
		rustBaseURL: envOr("RUST_API_BASE_URL", "http://osc_rest:8000"),
		rustToken:   os.Getenv("RUST_API_TOKEN"), // kosong = tanpa auth (fase auth belum aktif)
	}

	interval, err := time.ParseDuration(envOr("AGENT_CS_INTERVAL", "30s"))
	if err != nil {
		return cfg, fmt.Errorf("AGENT_CS_INTERVAL tidak valid: %w", err)
	}
	if interval < time.Second || interval > time.Hour {
		return cfg, fmt.Errorf("AGENT_CS_INTERVAL di luar rentang 1s..1h: %s", interval)
	}
	cfg.interval = interval

	switch envOr("AGENT_CS_LOG_LEVEL", "info") {
	case "debug":
		cfg.logLevel = slog.LevelDebug
	case "warn":
		cfg.logLevel = slog.LevelWarn
	case "error":
		cfg.logLevel = slog.LevelError
	default:
		cfg.logLevel = slog.LevelInfo
	}
	return cfg, nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	var (
		console = flag.Bool("run-console", false, "paksa mode console (lewati deteksi Windows Service)")
		once    = flag.Bool("once", false, "jalankan satu siklus probe lalu keluar")
		showVer = flag.Bool("version", false, "tampilkan versi")
	)
	flag.Parse()
	if *showVer {
		fmt.Println("agent_cs", version)
		return
	}

	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "agent_cs:", err)
		os.Exit(1)
	}

	// Log terstruktur (JSON) — token/kredensial TIDAK PERNAH masuk log.
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.logLevel}))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// --- Wiring (dependency injection): satu-satunya titik yang menyentuh
	// adapter infrastructure; arah dependensi domain <- usecase <- infra ---
	probe := rustapi.New(cfg.rustBaseURL, cfg.rustToken, logger)
	checker := usecase.NewHealthChecker(probe, logger)
	scheduler := delivery.NewScheduler(cfg.interval, checker, logger)

	if *once {
		if _, err := checker.RunOnce(ctx); err != nil {
			fmt.Fprintln(os.Stderr, "agent_cs:", err)
			os.Exit(1)
		}
		return
	}

	// Worker jalan di goroutine terpisah; lifecycle OS di goroutine utama.
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		scheduler.Start(ctx)
	}()

	logger.Info("agent_cs berjalan",
		"version", version,
		"interval", cfg.interval.String(),
		"upstream", cfg.rustBaseURL,
	)

	// Lifecycle: blok sampai OS/console meminta stop, lalu batalkan context
	// agar worker drain dengan bersih (graceful shutdown).
	if err := platform.NewRunner(logger, *console).AwaitStop(ctx, cancel); err != nil {
		logger.Error("lifecycle error", "err", err)
		os.Exit(1)
	}
	cancel()
	wg.Wait()
	logger.Info("agent_cs berhenti dengan bersih")
}
