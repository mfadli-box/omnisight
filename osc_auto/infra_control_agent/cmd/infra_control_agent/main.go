// infra_control_agent — agent control plane infrastruktur omnisight.
//
// Mode eksekusi:
//   - Linux (systemd)  : berjalan foreground (Type=simple), stop via
//     SIGINT/SIGTERM dari systemd.
//   - Windows          : otomatis terdeteksi SCM (Windows Service) atau
//     console; --run-console memaksa mode console.
//   - --enroll <TOKEN> : tukar one-time enrollment token (butuh
//     --asset-model & --status-label) → simpan kredensial → keluar.
//   - --once           : satu siklus tarik-eksekusi-ack lalu keluar (debug).
//   - --version        : tampilkan versi.
//
// Tugas: kelola file compose.yaml dalam STACKS_DIR (validasi path ketat)
// dan virtual host Nginx (nginx -t sebelum reload, rollback otomatis bila
// gagal). Kontrak: osc_docs/rest/contracts/w2.openapi.yaml.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/delivery"
	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/infrastructure/execrunner"
	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/infrastructure/osfile"
	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/infrastructure/platform"
	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/infrastructure/rustapi"
	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/infrastructure/storage"
	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/usecase"
)

const version = "0.1.0"

const agentPrefix = "infra_control_agent"

type config struct {
	baseURL     string
	interval    time.Duration
	stacksDir   string
	nginxDir    string
	dockerBin   string
	nginxBin    string
	statePath   string
	stateKeyHex string
	logLevel    slog.Level
}

func loadConfig() (config, error) {
	cfg := config{
		baseURL:     envOr("RUST_API_BASE_URL", "http://osc_rest:8000"),
		stacksDir:   envOr("INFRA_CONTROL_STACKS_DIR", defaultStacksDir()),
		nginxDir:    envOr("INFRA_CONTROL_NGINX_CONFIG_DIR", defaultNginxConfigDir()),
		dockerBin:   envOr("INFRA_CONTROL_DOCKER_BIN", "docker"),
		nginxBin:    envOr("INFRA_CONTROL_NGINX_BIN", "nginx"),
		statePath:   os.Getenv("INFRA_CONTROL_STATE_PATH"),
		stateKeyHex: os.Getenv("INFRA_CONTROL_STATE_KEY_HEX"),
	}
	if !isAbs(cfg.stacksDir) {
		return cfg, fmt.Errorf("INFRA_CONTROL_STACKS_DIR harus absolut: %s", cfg.stacksDir)
	}
	if !isAbs(cfg.nginxDir) {
		return cfg, fmt.Errorf("INFRA_CONTROL_NGINX_CONFIG_DIR harus absolut: %s", cfg.nginxDir)
	}

	var err error
	if cfg.interval, err = parseDurationEnv("INFRA_CONTROL_POLL_INTERVAL", "10s"); err != nil {
		return cfg, err
	}
	if cfg.interval < 5*time.Second || cfg.interval > 10*time.Minute {
		return cfg, fmt.Errorf("INFRA_CONTROL_POLL_INTERVAL di luar rentang 5s..10m: %s", cfg.interval)
	}

	switch envOr("INFRA_CONTROL_LOG_LEVEL", "info") {
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
		once        = flag.Bool("once", false, "satu siklus tarik-eksekusi-ack lalu keluar (debug)")
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

	controller := usecase.NewDispatcher(
		client, client, client, // source, ack, logs (satu klien HMAC)
		execrunner.New(), osfile.New(), // runner, filesystem
		cfg.stacksDir, cfg.nginxDir, cfg.dockerBin, cfg.nginxBin, logger,
	)

	if *once {
		if err := controller.RunOnce(context.Background()); err != nil {
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
		delivery.NewDispatcher(cfg.interval, controller, logger).Start(ctx)
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

func parseDurationEnv(key, def string) (time.Duration, error) {
	raw := envOr(key, def)
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s tidak valid: %w", key, err)
	}
	return d, nil
}
