// network_poller_agent — agent polling uptime & SNMP omnisight.
//
// Mode eksekusi:
//   - Linux (systemd)  : berjalan foreground (Type=simple), stop via
//     SIGINT/SIGTERM dari systemd.
//   - Windows          : otomatis terdeteksi SCM (Windows Service) atau
//     console; --run-console memaksa mode console.
//   - --enroll <TOKEN> : tukar one-time enrollment token (butuh
//     --asset-model & --status-label) → simpan kredensial → keluar.
//   - --once           : jalankan satu siklus polling lalu keluar (debug).
//   - --version        : tampilkan versi.
//
// Konfigurasi via environment variables + file monitors.json
// (lihat configs/*.env.example). Alur: probe (HTTP(S)/TCP/DNS/ICMP + SNMP)
// → HMAC ingest (heartbeat & metrics) → osc_rest
// (kontrak: osc_docs/rest/contracts/w2.openapi.yaml).
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/delivery"
	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/infrastructure/platform"
	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/infrastructure/probes"
	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/infrastructure/rustapi"
	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/infrastructure/storage"
	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/usecase"
)

const version = "0.1.0"

const agentPrefix = "network_poller_agent"

type config struct {
	baseURL      string
	interval     time.Duration
	probeTimeout time.Duration
	snmpTimeout  time.Duration
	monitorsPath string
	statePath    string
	stateKeyHex  string
	logLevel     slog.Level
}

func loadConfig() (config, error) {
	cfg := config{
		baseURL:      envOr("RUST_API_BASE_URL", "http://osc_rest:8000"),
		monitorsPath: os.Getenv("NETWORK_POLLER_MONITORS_FILE"),
		statePath:    os.Getenv("NETWORK_POLLER_STATE_PATH"),
		stateKeyHex:  os.Getenv("NETWORK_POLLER_STATE_KEY_HEX"),
	}
	if cfg.monitorsPath == "" {
		cfg.monitorsPath = defaultMonitorsPath()
	}

	var err error
	if cfg.interval, err = parseDurationEnv("NETWORK_POLLER_INTERVAL", "60s"); err != nil {
		return cfg, err
	}
	if cfg.interval < 10*time.Second || cfg.interval > time.Hour {
		return cfg, fmt.Errorf("NETWORK_POLLER_INTERVAL di luar rentang 10s..1h: %s", cfg.interval)
	}
	if cfg.probeTimeout, err = parseDurationEnv("NETWORK_POLLER_PROBE_TIMEOUT", "10s"); err != nil {
		return cfg, err
	}
	if cfg.probeTimeout < time.Second || cfg.probeTimeout > time.Minute {
		return cfg, fmt.Errorf("NETWORK_POLLER_PROBE_TIMEOUT di luar rentang 1s..1m: %s", cfg.probeTimeout)
	}
	if cfg.snmpTimeout, err = parseDurationEnv("NETWORK_POLLER_SNMP_TIMEOUT", "3s"); err != nil {
		return cfg, err
	}
	if cfg.snmpTimeout < 500*time.Millisecond || cfg.snmpTimeout > 30*time.Second {
		return cfg, fmt.Errorf("NETWORK_POLLER_SNMP_TIMEOUT di luar rentang 500ms..30s: %s", cfg.snmpTimeout)
	}

	switch envOr("NETWORK_POLLER_LOG_LEVEL", "info") {
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

func main() {
	var (
		enrollToken = flag.String("enroll", "", "one-time enrollment token (butuh --asset-model, --status-label)")
		assetModel  = flag.String("asset-model", "", "uuid asset_model (wajib untuk enroll, milik company token)")
		statusLabel = flag.String("status-label", "", "uuid status_label (wajib untuk enroll, milik company token)")
		mgmtIP      = flag.String("mgmt-ip", "", "alamat IP manajemen (opsional)")
		assetTag    = flag.String("asset-tag", "", "asset tag (opsional; default AG-<uuid7> server)")
		baseURLFlag = flag.String("base-url", "", "base URL osc_rest (override RUST_API_BASE_URL)")
		console     = flag.Bool("run-console", false, "paksa mode console (lewati deteksi Windows Service)")
		once        = flag.Bool("once", false, "jalankan satu siklus lalu keluar (debug)")
		showVer     = flag.Bool("version", false, "tampilkan versi")
	)
	flag.Parse()
	if *showVer {
		fmt.Printf("%s %s (%s/%s)\n", agentPrefix, version, runtime.GOOS, runtime.GOARCH)
		return
	}

	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: konfigurasi: %v\n", agentPrefix, err)
		os.Exit(1)
	}
	if *baseURLFlag != "" {
		cfg.baseURL = *baseURLFlag
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.logLevel}))

	// --- Alur enroll: tukar token, simpan state, keluar -----------------
	store, err := storage.New(cfg.statePath, cfg.stateKeyHex)
	if err != nil {
		logger.Error("inisialisasi state gagal", "err", err.Error())
		os.Exit(1)
	}
	if *enrollToken != "" {
		if code := runEnroll(logger, cfg, store, *enrollToken, *assetModel, *statusLabel, *mgmtIP, *assetTag); code != 0 {
			os.Exit(code)
		}
		return
	}

	// --- Alur normal: muat kredensial, jalankan siklus ------------------
	state, err := store.Load(context.Background())
	if err != nil {
		logger.Error("kredensial belum tersedia — jalankan --enroll <TOKEN> dari admin",
			"err", err.Error())
		os.Exit(1)
	}

	client := rustapi.New(state.BaseURL, state.AgentID, state.HmacSecret, logger)

	prober := probes.New(cfg.probeTimeout)
	snmpPoller := probes.NewCounterPoller(cfg.snmpTimeout, logger)
	source := storage.NewMonitorSource(cfg.monitorsPath)

	poller := usecase.NewPoller(source, prober, snmpPoller, client, cfg.probeTimeout, logger)

	if *once {
		if err := poller.RunOnce(context.Background()); err != nil {
			logger.Warn("siklus tunggal selesai dengan error", "err", err.Error())
		}
		return
	}

	// --- Loop utama dengan graceful shutdown -----------------------------
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		delivery.NewScheduler(cfg.interval, poller, logger).Start(ctx)
	}()

	runner := platform.NewRunner(logger, *console)
	if err := runner.AwaitStop(ctx, cancel); err != nil {
		logger.Error("runner berhenti dengan error", "err", err.Error())
	}

	<-done // tunggu worker drain bersih
	logger.Info("agent berhenti")
}

// runEnroll menukar token enrollment lalu menyimpan kredensial ke state
// lokal. hmac_secret tidak pernah dicetak (hanya tersimpan).
func runEnroll(logger *slog.Logger, cfg config, store *storage.Store,
	token, assetModel, statusLabel, mgmtIP, assetTag string) int {
	if assetModel == "" || statusLabel == "" {
		logger.Error("enroll membutuhkan --asset-model dan --status-label (uuid milik company token)")
		return 1
	}
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "unknown"
	}

	client := rustapi.New(cfg.baseURL, "", "", logger)
	creds, err := client.Enroll(context.Background(), domainEnrollRequest(
		token, hostname, mgmtIP, assetModel, statusLabel, assetTag))
	if err != nil {
		logger.Error("enrollment gagal", "err", err.Error())
		return 1
	}

	err = store.Save(context.Background(), storage.AgentState{
		AgentID:    creds.AgentID,
		CompanyID:  creds.CompanyID,
		HmacSecret: creds.HmacSecret,
		NodeType:   creds.NodeType,
		AssetTag:   creds.AssetTag,
		BaseURL:    cfg.baseURL,
		EnrolledAt: time.Now().UTC(),
	})
	if err != nil {
		logger.Error("menyimpan kredensial gagal (hmac_secret akan hilang — minta token baru)", "err", err.Error())
		return 1
	}

	logger.Info("enrollment sukses — kredensial tersimpan (hmac_secret hanya di disk terproteksi)",
		"agent_id", creds.AgentID, "company_id", creds.CompanyID,
		"asset_tag", creds.AssetTag, "state_path", cfg.statePath)
	return 0
}

// --- helper env -----------------------------------------------------------

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func parseDurationEnv(key, def string) (time.Duration, error) {
	raw := envOr(key, def)
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s tidak valid: %w", key, err)
	}
	return d, nil
}
