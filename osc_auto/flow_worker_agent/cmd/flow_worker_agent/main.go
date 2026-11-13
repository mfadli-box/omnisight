// flow_worker_agent — worker notifikasi & retensi omnisight (W3).
//
// Tanggung jawab (blueprint bab 5.8 — Centralized Notification Dispatcher):
//  1. Menerima pesan notifikasi dari produsen (osc_rest menulis antrean
//     outbox; agent menerima via listener ber-HMAC /api/v1/flow/enqueue)
//     dan mengirimnya asinkron ke channel:
//     - SMTP_EMAIL (termasuk email token reset MFA sekali pakai)
//     - TELEGRAM   (alert downtime / disk penuh / SIEM critical)
//     - WEBHOOK    (outbound generik + Slack-compatible)
//  2. Retry exponential-backoff + jitter, dedupe event_id, dead-letter.
//  3. Data Retention Cleanup terjadwal → POST /api/v1/agents/retention/purge
//     (kebijakan 30–90 hari di-clamp server-side osc_rest).
//
// Mode eksekusi:
//   - Linux (systemd): foreground, stop via SIGINT/SIGTERM.
//   - Windows        : SCM (Windows Service) atau console.
//   - --enroll <TOKEN> : tukar one-time enrollment token → simpan
//     kredensial → keluar.
//   - --version : tampilkan versi.
//
// Konfigurasi via environment (configs/flow_worker_agent.env.example).
// Kontrak: osc_docs/rest/contracts/w3.openapi.yaml.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/delivery"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/listener"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/platform"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/queue"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/rustapi"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/smtp"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/storage"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/telegram"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/infrastructure/webhook"
	"github.com/mfadli-box/omnisight/osc_auto/flow_worker_agent/internal/usecase"
)

const version = "0.1.0"

const agentPrefix = "flow_worker_agent"

type config struct {
	baseURL        string
	listen         string
	listenSecret   string
	listenEnabled  bool
	workers        int
	maxAttempts    int
	dispatchTick   time.Duration
	queuePath      string
	queueKeyHex    string
	retentionOn    bool
	retentionEvery time.Duration
	retentionDry   bool
	statePath      string
	stateKeyHex    string
	logLevel       slog.Level
}

func loadConfig() (config, error) {
	cfg := config{
		baseURL:       envOr("RUST_API_BASE_URL", "http://osc_rest:8000"),
		listen:        envOr("FLOW_WORKER_LISTEN", ":8095"),
		listenSecret:  os.Getenv("FLOW_WORKER_LISTEN_SECRET_HEX"),
		listenEnabled: envBool("FLOW_WORKER_LISTEN_ENABLED", true),
		queuePath:     os.Getenv("FLOW_WORKER_QUEUE_PATH"),
		queueKeyHex:   os.Getenv("FLOW_WORKER_QUEUE_KEY_HEX"),
		statePath:     os.Getenv("FLOW_WORKER_STATE_PATH"),
		stateKeyHex:   os.Getenv("FLOW_WORKER_STATE_KEY_HEX"),
		retentionOn:   envBool("FLOW_WORKER_RETENTION_ENABLED", true),
		retentionDry:  envBool("FLOW_WORKER_RETENTION_DRY_RUN", false),
	}
	// Path default antrean mengikuti direktori state per-OS.
	if cfg.queuePath == "" {
		cfg.queuePath = defaultQueuePath(cfg.statePath)
	}

	workers, err := parseIntEnv("FLOW_WORKER_WORKERS", 4)
	if err != nil {
		return cfg, err
	}
	cfg.workers = workers
	if cfg.maxAttempts, err = parseIntEnv("FLOW_WORKER_MAX_ATTEMPTS", 5); err != nil {
		return cfg, err
	}
	if cfg.dispatchTick, err = parseDurationEnv("FLOW_WORKER_DISPATCH_INTERVAL", time.Second); err != nil {
		return cfg, err
	}
	if cfg.retentionEvery, err = parseDurationEnv("FLOW_WORKER_RETENTION_INTERVAL", 24*time.Hour); err != nil {
		return cfg, err
	}
	if cfg.workers < 1 || cfg.workers > 64 {
		return cfg, fmt.Errorf("FLOW_WORKER_WORKERS di luar rentang 1..64: %d", cfg.workers)
	}
	if cfg.maxAttempts < 1 || cfg.maxAttempts > 20 {
		return cfg, fmt.Errorf("FLOW_WORKER_MAX_ATTEMPTS di luar rentang 1..20: %d", cfg.maxAttempts)
	}

	switch envOr("FLOW_WORKER_LOG_LEVEL", "info") {
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
		assetModel  = flag.String("asset-model", "", "uuid asset_model (wajib untuk enroll)")
		statusLabel = flag.String("status-label", "", "uuid status_label (wajib untuk enroll)")
		mgmtIP      = flag.String("mgmt-ip", "", "alamat IP manajemen (opsional)")
		assetTag    = flag.String("asset-tag", "", "asset tag (opsional)")
		baseURLFlag = flag.String("base-url", "", "base URL osc_rest (override RUST_API_BASE_URL)")
		console     = flag.Bool("run-console", false, "paksa mode console (lewati deteksi Windows Service)")
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

	state, err := store.Load(context.Background())
	if err != nil {
		logger.Error("kredensial belum tersedia — jalankan --enroll <TOKEN> dari admin", "err", err.Error())
		os.Exit(1)
	}

	q, err := queue.Open(cfg.queuePath, cfg.queueKeyHex)
	if err != nil {
		logger.Error("inisialisasi antrean gagal", "err", err.Error())
		os.Exit(1)
	}

	client := rustapi.New(state.BaseURL, state.AgentID, state.HmacSecret, logger)

	senders := map[domain.ChannelType]domain.Sender{
		domain.ChannelSMTP:     smtp.New(),
		domain.ChannelTelegram: telegram.New(),
		domain.ChannelWebhook:  webhook.New(),
	}
	if err := usecase.ValidateSenderRegistry(senders); err != nil {
		logger.Error("registry sender tidak lengkap", "err", err.Error())
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var listenerSrv *listener.Server
	if cfg.listenEnabled {
		listenerSrv, err = delivery.NewListener(cfg.listen, cfg.listenSecret, q, logger)
		if err != nil {
			// Deny-by-default: tanpa shared secret listener tidak boleh jalan.
			logger.Error("listener tidak dapat dimulai (isi FLOW_WORKER_LISTEN_SECRET_HEX atau matikan FLOW_WORKER_LISTEN_ENABLED)", "err", err.Error())
			os.Exit(1)
		}
		go func() {
			logger.Info("listener enqueue aktif", "addr", cfg.listen, "path", listener.EnqueuePath)
			if err := listenerSrv.Start(); err != nil {
				logger.Error("listener berhenti dengan error", "err", err.Error())
				cancel()
			}
		}()
	} else {
		logger.Info("listener enqueue dinonaktifkan (FLOW_WORKER_LISTEN_ENABLED=false)")
	}

	dispatcher := usecase.NewDispatcher(q, senders, cfg.workers, cfg.maxAttempts,
		cfg.dispatchTick, logger)
	go dispatcher.Run(ctx)

	if cfg.retentionOn {
		retention := usecase.NewRetentionJob(client, cfg.retentionEvery, cfg.retentionDry, logger)
		go retention.Run(ctx)
		logger.Info("job retensi aktif", "interval", cfg.retentionEvery.String(), "dry_run", cfg.retentionDry)
	}

	runner := platform.NewRunner(logger, *console)
	if err := runner.AwaitStop(ctx, cancel); err != nil {
		logger.Error("runner berhenti dengan error", "err", err.Error())
	}
	cancel()

	if listenerSrv != nil {
		_ = listenerSrv.Close()
	}
	logger.Info("flow_worker_agent berhenti", "pending_queue", q.Len(), "dead_lettered", q.DeadLettered())
}

// runEnroll menukar token enrollment lalu menyimpan kredensial ke state
// lokal. hmac_secret tidak pernah dicetak.
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
	if err := store.Save(context.Background(), storage.AgentState{
		AgentID:    creds.AgentID,
		CompanyID:  creds.CompanyID,
		HmacSecret: creds.HmacSecret,
		NodeType:   creds.NodeType,
		AssetTag:   creds.AssetTag,
		BaseURL:    cfg.baseURL,
		EnrolledAt: time.Now().UTC(),
	}); err != nil {
		logger.Error("menyimpan kredensial gagal (hmac_secret akan hilang — minta token baru)", "err", err.Error())
		return 1
	}
	logger.Info("enrollment sukses — kredensial tersimpan (hmac_secret hanya di disk terproteksi)",
		"agent_id", creds.AgentID, "company_id", creds.CompanyID, "state_path", cfg.statePath)
	return 0
}
