// host_telemetry_agent — agent pengumpul telemetri host omnisight.
//
// Mode eksekusi:
//   - Linux (systemd)  : berjalan foreground (Type=simple), stop via
//     SIGINT/SIGTERM dari systemd.
//   - Windows          : otomatis terdeteksi SCM (Windows Service) atau
//     console; --run-console memaksa mode console.
//   - --enroll <TOKEN> : tukar one-time enrollment token (butuh
//     --asset-model & --status-label) → simpan kredensial → keluar.
//   - --once           : jalankan satu siklus pengumpulan lalu keluar (debug).
//   - --version        : tampilkan versi.
//
// Konfigurasi via environment variables (lihat configs/*.env.example).
// Alur: collect (OS + Docker Engine API) → HMAC ingest → osc_rest
// (kontrak: osc_docs/rest/contracts/w2.openapi.yaml).
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/delivery"
	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/infrastructure/platform"
	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/infrastructure/rustapi"
	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/infrastructure/storage"
	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/usecase"
)

const version = "0.1.0"

const agentPrefix = "host_telemetry_agent"

type config struct {
	baseURL        string
	interval       time.Duration
	inventoryEvery time.Duration
	fimEnabled     bool
	fimPaths       []string
	fimEvery       time.Duration
	dockerEnabled  bool
	dockerSocket   string
	dockerHostID   string
	statePath      string
	stateKeyHex    string
	logLevel       slog.Level
}

func loadConfig() (config, error) {
	cfg := config{
		baseURL:       envOr("RUST_API_BASE_URL", "http://osc_rest:8000"),
		dockerEnabled: envBool("HOST_TELEMETRY_DOCKER_ENABLED", true),
		dockerSocket:  os.Getenv("HOST_TELEMETRY_DOCKER_SOCKET"),
		dockerHostID:  os.Getenv("HOST_TELEMETRY_DOCKER_HOST_ID"),
		statePath:     os.Getenv("HOST_TELEMETRY_STATE_PATH"),
		stateKeyHex:   os.Getenv("HOST_TELEMETRY_STATE_KEY_HEX"),
		fimEnabled:    envBool("HOST_TELEMETRY_FIM_ENABLED", true),
	}

	var err error
	if cfg.interval, err = parseDurationEnv("HOST_TELEMETRY_INTERVAL", "60s"); err != nil {
		return cfg, err
	}
	if cfg.interval < time.Second || cfg.interval > time.Hour {
		return cfg, fmt.Errorf("HOST_TELEMETRY_INTERVAL di luar rentang 1s..1h: %s", cfg.interval)
	}
	if cfg.inventoryEvery, err = parseDurationEnv("HOST_TELEMETRY_INVENTORY_INTERVAL", "1h"); err != nil {
		return cfg, err
	}
	if cfg.inventoryEvery < time.Minute || cfg.inventoryEvery > 24*time.Hour {
		return cfg, fmt.Errorf("HOST_TELEMETRY_INVENTORY_INTERVAL di luar rentang 1m..24h: %s", cfg.inventoryEvery)
	}
	if cfg.fimEvery, err = parseDurationEnv("HOST_TELEMETRY_FIM_INTERVAL", "15m"); err != nil {
		return cfg, err
	}
	if cfg.fimEvery < time.Minute || cfg.fimEvery > 24*time.Hour {
		return cfg, fmt.Errorf("HOST_TELEMETRY_FIM_INTERVAL di luar rentang 1m..24h: %s", cfg.fimEvery)
	}
	if raw := os.Getenv("HOST_TELEMETRY_FIM_PATHS"); raw != "" {
		cfg.fimPaths = splitCSV(raw)
	}

	switch envOr("HOST_TELEMETRY_LOG_LEVEL", "info") {
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
	sysCollector := platform.NewSystemCollector(logger)

	var dockerCollector domain.DockerStatsCollector
	var dockerEnabled bool
	if cfg.dockerEnabled {
		dockerCollector = platform.NewDockerCollector(cfg.dockerSocket, cfg.dockerHostID, logger)
		dockerEnabled = cfg.dockerHostID != ""
		if cfg.dockerHostID == "" {
			logger.Warn("HOST_TELEMETRY_DOCKER_HOST_ID kosong — metrics container dilewati")
		}
	}

	// FIM ringan (W3): scan checksum+permission SCHEDULED → ingest SecOps.
	var fimCollector domain.FimCollector
	if cfg.fimEnabled {
		fimCollector = platform.NewFimScanner(cfg.fimPaths, store, logger)
	}

	collector := usecase.NewCollector(sysCollector, dockerCollector, dockerEnabled,
		cfg.inventoryEvery, fimCollector, cfg.fimEvery, client, logger)

	if *once {
		if err := collector.RunOnce(context.Background()); err != nil {
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
		delivery.NewScheduler(cfg.interval, collector, logger).Start(ctx)
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

	// Simpan base URL yang dipakai agar runtime memakai endpoint sama.
	client := rustapi.New(cfg.baseURL, "", "", logger)
	creds, err := client.Enroll(context.Background(), domain.EnrollRequest{
		EnrollmentToken: token,
		Hostname:        hostname,
		MgmtIP:          mgmtIP,
		AssetModelID:    assetModel,
		StatusLabelID:   statusLabel,
		AssetTag:        assetTag,
		AgentVersion:    version,
	})
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

func envBool(key string, def bool) bool {
	switch os.Getenv(key) {
	case "1", "true", "TRUE", "yes":
		return true
	case "0", "false", "FALSE", "no":
		return false
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

// splitCSV memecah string CSV menjadi slice (dipakai untuk path FIM).
func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
