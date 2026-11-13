// pam_bastion_gateway — WebSocket-to-SSH bastion proxy omnisight (W3).
//
// Alur: browser (xterm.js) membuka WS {PAM_GATEWAY_WS_PATH} → frame
// pertama {"session_id","ticket"} (ephemeral ticket dari authorize
// osc_rest; TTL ≤120 s, sekali pakai) → gateway redeem ke osc_rest
// (HMAC agent) → kredensial target diturunkan KE MEMORI SAJA (tidak
// pernah ke browser) → gateway dial SSH target (known_hosts TOFU) →
// pump terminal dengan **Command ACL Blacklist real-time** → rekaman
// asciicast CAST_GZ diunggah ke osc_rest → bucket privat RustFS.
//
// Mode eksekusi:
//   - Linux (systemd): foreground, stop via SIGINT/SIGTERM.
//   - Windows        : SCM (Windows Service) atau console.
//   - --enroll <TOKEN> : tukar one-time enrollment token → simpan
//     kredensial → keluar.
//   - --version : tampilkan versi.
//
// Konfigurasi via environment (configs/pam_bastion_gateway.env.example).
// Kontrak: osc_docs/rest/contracts/w3.openapi.yaml.
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

	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/delivery"
	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/infrastructure/platform"
	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/infrastructure/rustapi"
	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/infrastructure/ssh"
	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/infrastructure/storage"
	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/infrastructure/wsserver"
	"github.com/mfadli-box/omnisight/osc_auto/pam_bastion_gateway/internal/usecase"
)

const version = "0.1.0"

const agentPrefix = "pam_bastion_gateway"

type config struct {
	baseURL         string
	listen          string
	wsPath          string
	allowedOrigins  []string
	maxSessions     int64
	knownHostsPath  string
	recordingDir    string
	statePath       string
	stateKeyHex     string
	logLevel        slog.Level
}

func loadConfig() (config, error) {
	cfg := config{
		baseURL:        envOr("RUST_API_BASE_URL", "http://osc_rest:8000"),
		listen:         envOr("PAM_GATEWAY_LISTEN", ":8090"),
		wsPath:         envOr("PAM_GATEWAY_WS_PATH", "/gateway/ws"),
		statePath:      os.Getenv("PAM_GATEWAY_STATE_PATH"),
		stateKeyHex:    os.Getenv("PAM_GATEWAY_STATE_KEY_HEX"),
		knownHostsPath: os.Getenv("PAM_GATEWAY_KNOWN_HOSTS"),
		recordingDir:   os.Getenv("PAM_GATEWAY_RECORDING_DIR"),
	}
	if origins := os.Getenv("PAM_GATEWAY_ALLOWED_ORIGINS"); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			if o = strings.TrimSpace(o); o != "" {
				cfg.allowedOrigins = append(cfg.allowedOrigins, o)
			}
		}
	}
	switch v := envOr("PAM_GATEWAY_MAX_SESSIONS", "20"); {
	case v == "":
		cfg.maxSessions = 20
	default:
		n := int64(0)
		if _, err := fmt.Sscanf(v, "%d", &n); err != nil || n < 1 || n > 1000 {
			return cfg, fmt.Errorf("PAM_GATEWAY_MAX_SESSIONS tidak valid (1..1000): %s", v)
		}
		cfg.maxSessions = n
	}

	switch envOr("PAM_GATEWAY_LOG_LEVEL", "info") {
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
		logger.Error("kredensial belum tersedia — jalankan --enroll <TOKEN> dari admin",
			"err", err.Error())
		os.Exit(1)
	}

	client := rustapi.New(state.BaseURL, state.AgentID, state.HmacSecret, logger)
	sshDialer := ssh.NewDialer(cfg.knownHostsPath, logger)
	bastion := usecase.NewBastionService(client, sshDialer, cfg.maxSessions, logger)

	var wsServer *wsserver.Server
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		wsServer = wsserver.New(cfg.listen, cfg.wsPath, cfg.allowedOrigins,
			func(stream domain.TerminalStream, ip string) {
				delivery.ServeSession(ctx, bastion, stream, ip, logger)
			}, logger)
		if err := wsServer.Start(); err != nil {
			logger.Error("gateway WS berhenti dengan error", "err", err.Error())
			cancel()
		}
	}()

	runner := platform.NewRunner(logger, *console)
	if err := runner.AwaitStop(ctx, cancel); err != nil {
		logger.Error("runner berhenti dengan error", "err", err.Error())
	}
	cancel()

	if wsServer != nil {
		_ = wsServer.Close()
	}
	<-done // tunggu sesi drain bersih
	logger.Info("gateway berhenti")
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

// --- helper env -----------------------------------------------------------

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
