# Technical Documentation: agent_cs (`agent_cs`)

- **Date**: 2026-11-11
- **Author**: ai-auto (Golang System & Security Engineer)
- **Target Project**: `osc_auto/agent_cs`
- **Upstream Rust API Reference**: `osc_docs/rest/api-core-foundation.md` (`GET /api/v1/health`)
- **Supported Platforms**: Linux (`systemd`, `amd64`) & Windows (`Windows Service`, `amd64`)
- **Clean Architecture Layers Touched**: `domain`, `usecase`, `infrastructure`, `delivery`

## 1. Overview & System Architecture

`agent_cs` adalah agent latar belakang pertama omnisight (boilerplate bertingkat produksi): secara periodik men-probe kesehatan `osc_rest` melalui `GET /api/v1/health`, mencatat hasilnya sebagai log JSON terstruktur, dan siap diperluas menjadi pengumpul data/eksekutor tugas pada fase berikutnya. Tidak ada state di disk dan tidak ada listener inbound pada fase ini (permukaan serangan minimal).

```
┌─ Linux (systemd) : SIGINT/SIGTERM ──┐      ┌─ Windows: SCM (svc.Run) ─┐
│                                     │      │   atau console (--run-   │
│  cmd/agent_cs/main.go  (wiring DI)  │◄─────┤   console / --once)      │
│      │                              │      └──────────────────────────┘
│      ▼                              │
│  delivery.Scheduler (ticker loop)   │
│      │  setiap AGENT_CS_INTERVAL    │
│      ▼                              │
│  usecase.HealthChecker.RunOnce(ctx) │
│      │  port: domain.RustAPIProbe   │
│      ▼                              │
│  infrastructure/rustapi.Client      │
│      └── HTTPS GET /api/v1/health ──┼──► osc_rest (axum) ──► {status, checks}
└─────────────────────────────────────┘
```

Aturan dependensi yang dipaksa (arah selalu ke dalam):

| Layer | Boleh bergantung pada | Dilarang meng-import |
| :--- | :--- | :--- |
| `internal/domain/` | stdlib murni | HTTP, syscall OS, framework apa pun |
| `internal/usecase/` | `domain/` (interface) | adapter konkret |
| `internal/infrastructure/` | `domain/` ports; `net/http`; `golang.org/x/sys/windows/svc` (khusus `_windows.go`) | `usecase` |
| `internal/delivery/` | `usecase` | detail transport |
| `cmd/` (entrypoint) | semuanya (satu-satunya titik wiring DI) | — |

Lifecycle & graceful shutdown: worker scheduler berjalan di goroutine terpisah; `platform.Runner` (build-tag `linux`/`windows`) memblokir hingga OS/console meminta berhenti, lalu `context.Context` dibatalkan sehingga probe in-flight abort dan loop ticker keluar; `main` menunggu drain via `sync.WaitGroup` sebelum proses keluar.

Mode eksekusi: foreground sebagai service (`systemd` Type=simple / SCM), `--run-console` (paksa console, melewati deteksi SCM di Windows), `--once` (satu siklus lalu keluar — untuk debugging/cron), `--version`.

## 2. Directory & Clean Architecture Layout (`osc_auto/agent_cs/`)

```text
osc_auto/agent_cs/
├── cmd/agent_cs/main.go          # entrypoint: flag, config env, wiring DI, lifecycle
├── internal/
│   ├── domain/
│   │   ├── health.go             # ServiceHealth + port RustAPIProbe
│   │   └── errors.go             # ErrUnreachable, ErrInvalidResponse
│   ├── usecase/
│   │   ├── health_check.go       # HealthChecker.RunOnce (log + pemetaan gagal)
│   │   └── health_check_test.go  # unit test (fakeProbe, tanpa I/O)
│   ├── infrastructure/
│   │   ├── rustapi/client.go     # klien HTTP hardened (TLS 1.2+, retry+jitter)
│   │   └── platform/
│   │       ├── runner.go         # interface Runner + NewRunner (bebas build tag)
│   │       ├── service_linux.go  # //go:build linux  → SIGINT/SIGTERM
│   │       └── service_windows.go# //go:build windows → svc.IsWindowsService/svc.Run
│   └── delivery/scheduler.go     # ticker loop blocking (Start(ctx))
├── deploy/
│   ├── linux/agent_cs.service    # unit systemd (DynamicUser + hardening)
│   └── windows/install-service.ps1 # sc.exe create/description/failure/start
├── configs/agent_cs.env.example  # template env (file asli: 0600, tidak di-commit)
├── go.mod / go.sum               # module mandiri: golang.org/x/sys v0.42.0
└── .gitignore                    # bin/, *.exe, *.env (kecuali *.example)
```

## 3. Upstream Rust API (`osc_rest`) Integration Contract

| Endpoint (`osc_rest`) | Method | Auth Mechanism | Retry & Timeout Policy | Payload / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/health` | `GET` | Tanpa token pada fase bootstrap; `Bearer <RUST_API_TOKEN>` otomatis saat token diset (fase auth) | Timeout total 10s (dial 5s, TLS handshake 5s, response header 10s); 3 percobaan, exp. backoff 500ms/1s/2s + full jitter (`crypto/rand`) | Probe kesehatan: `200 → {"status":"ok","checks":{database,storage}}`; `503 → {"status":"degraded",...}` dianggap jawaban final (osc_rest terjangkau, dependensi turun) — **tidak** di-retry |

Pemetaan error (domain, tanpa detail transport bocor ke pesan):

| Kondisi | Error domain | Retry? |
| :--- | :--- | :--- |
| Network/gateway gagal (dial, TLS, timeout, reset, 5xx/429 tanpa body health) | `ErrUnreachable` | ya (sampai 3 percobaan) |
| Kontrak salah (URL dasar tidak valid, 3xx/4xx lain, JSON rusak, `status` bukan `ok\|degraded`) | `ErrInvalidResponse` | tidak |

Snapshot hasil (`domain.ServiceHealth`): `Service: "osc_rest"`, `Status: ok|degraded|down`, `Reachable: bool` — sudah terverifikasi lewat smoke test: upstream mati → 3 percobaan ber-jitter → `status:"down", reachable:false`, exit code 1 pada mode `--once`.

## 4. Cross-Platform Deployment & Service Configuration

### Linux (`systemd`, `amd64`)
```bash
cd osc_auto/agent_cs
go build -trimpath -ldflags="-s -w" -o bin/agent_cs ./cmd/agent_cs
sudo install -m 0755 bin/agent_cs /usr/local/bin/agent_cs
sudo install -m 0644 deploy/linux/agent_cs.service /etc/systemd/system/
sudo mkdir -p /etc/agent_cs
sudo install -m 0600 configs/agent_cs.env.example /etc/agent_cs/agent_cs.env   # isi nilai asli
sudo systemctl daemon-reload && sudo systemctl enable --now agent_cs
journalctl -u agent_cs -o json-pretty   # log JSON terstruktur
```
Unit memakai `Type=simple`, `DynamicUser=yes` (UID non-root per-service), `Restart=on-failure` (5s), dan hardening `systemd` lengkap (lihat §5). `EnvironmentFile=-/etc/agent_cs/agent_cs.env` bersifat opsional (prefiks `-`).

### Windows (`Windows Service`, `amd64`)
```powershell
cd osc_auto\agent_cs
$env:GOOS='windows'; $env:GOARCH='amd64'
go build -trimpath -o "$env:ProgramData\agent_cs\agent_cs.exe" ./cmd/agent_cs
# PowerShell as Administrator, dari deploy/windows/:
.\install-service.ps1 Install     # sc.exe create + description + failure(restart 5s/30s/60s, reset 24h) + start
.\install-service.ps1 Status      # sc.exe query
.\install-service.ps1 Uninstall   # stop + delete
```
Binary terdeteksi otomatis sebagai service (SCM) atau console; `svc.Run` + `svcHandler.Execute` mengelola transisi `StartPending → Running → StopPending → Stopped`. Service berjalan sebagai `NT AUTHORITY\LocalService` (bukan LocalSystem). Environment per-service diatur via registry `Environment` (REG_MULTI_SZ) — template tercantum sebagai blok berkomentar di `install-service.ps1`.

### Environment Variables (`configs/agent_cs.env.example`)

| Variabel | Default | Keterangan |
| :--- | :--- | :--- |
| `RUST_API_BASE_URL` | `http://osc_rest:8000` | Base URL osc_rest (DNS internal compose; produksi: `https://...`) |
| `RUST_API_TOKEN` | *(kosong)* | Token Bearer (dipasang fase auth); kosong = tanpa header Authorization |
| `AGENT_CS_INTERVAL` | `30s` | Interval antar-probe; wajib 1s..1h |
| `AGENT_CS_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` (JSON ke stdout) |

### Build & Verifikasi (wajib lulus keduanya)
```bash
cd osc_auto/agent_cs
gofmt -l . && go vet ./... && go test -race ./...          # ✅ lulus
go build -o bin/agent_cs ./cmd/agent_cs                    # Linux ELF
GOOS=windows GOARCH=amd64 go vet ./...                     # ✅ lulus (build tag svc)
GOOS=windows GOARCH=amd64 go build -o bin/agent_cs.exe ./cmd/agent_cs   # PE32+
```

## 5. Security Controls & Threat Mitigation

- [x] **TLS 1.2+ wajib** — `tls.Config{MinVersion: tls.VersionTLS12}`, tanpa `InsecureSkipVerify`; produksi wajib `https://` untuk `RUST_API_BASE_URL`.
- [x] **Timeout berlapis + batas body** — dial 5s, TLS handshake 5s, response header 10s, total 10s; `io.LimitReader` 1 MiB (anti memory-bomb) + drain body untuk reuse koneksi.
- [x] **Retry aman** — hanya transient (transport/5xx/429) yang diulang (maks 3 percobaan); backoff exponential **full jitter** ber-sumber `crypto/rand`; `503` dengan body `degraded` tidak diulang agar status dependensi tidak salah laporkan.
- [x] **Anti-proxy sidetrack** — `Proxy: nil` pada transport (trafik internal tidak mengikuti `HTTP(S)_PROXY` lingkungan).
- [x] **Secret hygiene** — token hanya dari environment (`RUST_API_TOKEN`), dikirim sebagai `Authorization: Bearer`, **tidak pernah** ditulis ke log; file env `0600` (Linux) / ACL terbatas (Windows); tidak ada kredensial di source.
- [x] **Log terstruktur tanpa PII/secret** — `slog` JSON ke stdout; hanya status probe, attempt, dan delay.
- [x] **Least privilege Linux** — `DynamicUser=yes`, `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `PrivateDevices`, `ProtectKernel*`, `RestrictAddressFamilies=AF_INET AF_INET6`, `MemoryDenyWriteExecute`, `CapabilityBoundingSet=` (kosong).
- [x] **Least privilege Windows** — service berjalan sebagai `LocalService` (bukan LocalSystem); `sc.exe failure` untuk pemulihan otomatis.
- [x] **Tanpa shell** — tidak ada `exec.Command`/`sh -c`; satu-satunya proses eksternal adalah util `sc.exe` di skrip instalasi Windows (argumen eksplisit, bukan string shell).
- [x] **Permukaan inbound kosong** — tidak ada listener/port; agent hanya klien HTTP keluar.
- [ ] **mTLS + HMAC/idempotency-key** — menyusul bersama fase auth `osc_rest` (endpoint mutasi agent akan datang pada fase orkestrasi).
- [ ] **Offline buffering** (`infrastructure/storage/` SQLite/BoltDB terenkripsi) — diaktifkan bila agent mulai mengirim data yang wajib reliabel.
