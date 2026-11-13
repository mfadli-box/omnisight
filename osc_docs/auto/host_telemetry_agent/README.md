# Technical Documentation: Host Telemetry Agent (`host_telemetry_agent`)

- **Date**: 2026-11-13
- **Author**: ai-auto (Golang System & Security Engineer)
- **Target Project**: `osc_auto/host_telemetry_agent`
- **Upstream Rust API & Contract Reference**: `osc_docs/rest/api-w2.md` & `osc_docs/rest/contracts/w2.openapi.yaml` (Wave 2 / Hari 13 SESI 3.1–3.2)
- **Supported Platforms**: Linux (`systemd`, `amd64`/`arm64`) & Windows (`Windows Service`, `amd64`)
- **Clean Architecture Layers Touched**: `domain`, `usecase`, `infrastructure` (`rustapi`, `storage`, `platform`), `delivery`

## 1. Overview & System Architecture

Agent pengumpul telemetri host yang berjalan sebagai daemon lintas-platform:

1. **Enrollment** (`--enroll <TOKEN>`): tukar one-time enrollment token via `POST /api/v1/agents/enroll` → dapat `agent_id` (ManagedNode dinamis pada `assets`), `hmac_secret` (ditampilkan sekali), `company_id`. Kredensial disimpan ke state lokal (`/var/lib/host_telemetry_agent/state.json` di Linux / `C:\ProgramData\host_telemetry_agent\state.json` di Windows, mode `0600`, opsional AES-256-GCM via `HOST_TELEMETRY_STATE_KEY_HEX`).
2. **Siklus pengumpulan** (interval `HOST_TELEMETRY_INTERVAL`, default 60s):
   - **Metrik host**: CPU % (delta `/proc/stat` / `GetSystemTimes`), load avg, memori (`/proc/meminfo` / `GlobalMemoryStatusEx`), disk (`statfs` / `GetDiskFreeSpaceEx`), jaringan Bps (delta `/proc/net/dev`; Windows: null), uptime.
   - **Container stats**: Docker Engine API (`/containers/json` + `/containers/{id}/stats?stream=false`) via unix socket (`/var/run/docker.sock`) atau named pipe (`\\.\pipe\docker_engine`); CPU %, mem used/limit, net/block Bps (delta counter, counter-reset clamp 0), pids. Batas batch 200 (kontrak server).
   - **Inventaris hardware/software** (interval `HOST_TELEMETRY_INVENTORY_INTERVAL`, default 1h): CPU model/cores, mem total, storage total, OS name/version, hostname (+ payload JSONB).
3. **Ingest HMAC** → `osc_rest` → `POST /agents/inventory/ingest` & `POST /agents/metrics/ingest` → `system_metric_snapshots`, `container_metric_snapshots`, `hardware_inventory_snapshots`.

```
delivery.Scheduler (ticker, graceful shutdown)
  → usecase.Collector
      → platform.SystemCollector   (collector_linux.go / collector_windows.go)
      → platform.DockerCollector   (docker.go + docker_linux.go / docker_windows.go)
      → rustapi.Client (HMAC)      → osc_rest
```

## 2. Directory & Clean Architecture Layout (`osc_auto/host_telemetry_agent/`)

```text
osc_auto/host_telemetry_agent/
├── cmd/host_telemetry_agent/main.go      # entrypoint, DI wiring, flag --enroll/--run-console/--once
├── internal/
│   ├── domain/                           # entitas Inventory/HostSample/ContainerSample + port
│   ├── usecase/                          # Collector (orchestrasi siklus) + unit test
│   ├── infrastructure/
│   │   ├── rustapi/                      # klien HMAC-SHA256 hardened + enroll/ingest
│   │   ├── storage/                      # state kredensial 0600 (+ AES-256-GCM opsional)
│   │   └── platform/                     # *_linux.go & *_windows.go (runner + collectors)
│   └── delivery/                         # scheduler periodik
├── configs/host_telemetry_agent.env.example
└── deploy/
    ├── linux/host_telemetry_agent.service
    └── windows/install-service.ps1
```

## 3. Upstream Rust API (`osc_rest`) Integration Contract

| Endpoint / WS (`osc_rest`) | Method / Proto | Auth Mechanism | Retry & Timeout Policy | Payload / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/agents/enroll` | `POST` | Public (enrollment token) | Timeout `15s`, 3× exp. backoff+jitter | Tukar token → `agent_id`, `hmac_secret` (sekali), `company_id` |
| `/api/v1/agents/inventory/ingest` | `POST` | `HMAC-SHA256` + `X-Correlation-ID` | Timeout `15s`, 3× exp. backoff (transport/5xx/429) | `InventoryPayload` — memutakhir `assets.hostname` + `last_seen_at` |
| `/api/v1/agents/metrics/ingest` | `POST` | `HMAC-SHA256` + `X-Correlation-ID` | Timeout `15s`, 3× exp. backoff | `MetricsPayload` (`host` + `containers` ≤ 200; server meng-evaluasi `AlertRule` histeresis) |
| `/api/v1/agents/security/ingest` | `POST` | `HMAC-SHA256` + `X-Correlation-ID` | Timeout `15s`, 3× exp. backoff | Batch FIM `fim_events` ≤ 500 (kontrak W3; 202 accepted) |

### File Integrity Monitoring (FIM) — W3 (SESI 4.2)

FIM ringan **SCHEDULED** (checksum, tanpa inotify) terintegrasi di siklus collector:

- **Path kritikal** (`HOST_TELEMETRY_FIM_PATHS`, CSV absolut; default Linux `/etc,/usr/local/bin,/usr/local/sbin`, Windows `C:\Windows\System32\drivers\etc`, `C:\Windows\System32\config`): file reguler + symlink aman (tidak mengikuti symlink di luar root — anti traversal), batas kedalaman/ukuran (anti polling berat).
- **Baseline & deteksi**: state lokal terenkripsi (`storage/fim.go`, 0600) menyimpan baseline SHA-256 + mode/uid/gid/mtime/size; scan berikutnya membandingkan → event `CREATED/MODIFIED/DELETED/ATTRIBUTE_CHANGED` (`detection_source=SCHEDULED`, `baseline_version`).
- **Jadwal** (`HOST_TELEMETRY_FIM_INTERVAL`, clamp 1m..24h, default 15m; scan pertama membangun baseline tanpa memicu event).
- **Ingest**: batch ke `POST /api/v1/agents/security/ingest` (kontrak W3; checksum hex-64 + atribut JSONB `old_attrs`/`new_attrs`), validasi kontrak sebelum kirim (event invalid dibuang dengan log, bukan gagal seluruh batch).

Signature HMAC kanonis: `hex(HMAC-SHA256(secret, "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}"))` dengan header `X-Agent-Id`, `X-Agent-Timestamp` (±30 s), `X-Agent-Signature`. Terverifikasi vektor tetap di `rustapi/client_test.go`.

## 4. Cross-Platform Deployment & Service Configuration

- **Linux (`systemd`)**: binary `/usr/local/bin/host_telemetry_agent` (non-root `DynamicUser=yes`, `StateDirectory` untuk state `0700`); unit `deploy/linux/host_telemetry_agent.service` dengan hardening lengkap (`ProtectSystem=strict`, `RestrictAddressFamilies=… AF_UNIX` untuk Docker socket). Container stats butuh akses baca `/var/run/docker.sock` (tambahkan `SupplementaryGroups=docker` atau ACL socket — jangan root).
- **Windows (`Windows Service`)**: binary `C:\ProgramData\host_telemetry_agent\host_telemetry_agent.exe`; service SCM `host_telemetry_agent` sebagai `NT AUTHORITY\LocalService` (`sc.exe create/failure` — restart 5s/30s/60s); deteksi SCM otomatis (`svc.IsWindowsService`), `--run-console` memaksa mode console.
- **Environment Variables**: `RUST_API_BASE_URL`, `HOST_TELEMETRY_INTERVAL`, `HOST_TELEMETRY_INVENTORY_INTERVAL`, `HOST_TELEMETRY_DOCKER_ENABLED`, `HOST_TELEMETRY_DOCKER_SOCKET`, `HOST_TELEMETRY_DOCKER_HOST_ID` (wajib untuk metrics container — uuid `docker_hosts` milik company), `HOST_TELEMETRY_FIM_ENABLED`, `HOST_TELEMETRY_FIM_INTERVAL`, `HOST_TELEMETRY_FIM_PATHS`, `HOST_TELEMETRY_STATE_PATH`, `HOST_TELEMETRY_STATE_KEY_HEX`, `HOST_TELEMETRY_LOG_LEVEL` (lihat `configs/host_telemetry_agent.env.example`).

Perintah build & verifikasi (dari `osc_auto/host_telemetry_agent/`):

```bash
go vet ./... && GOOS=windows GOARCH=amd64 go vet ./...
go test -race ./...
GOOS=linux GOARCH=amd64 go build -o bin/host_telemetry_agent ./cmd/host_telemetry_agent
GOOS=windows GOARCH=amd64 go build -o bin/host_telemetry_agent.exe ./cmd/host_telemetry_agent
```

## 5. Security Controls & Threat Mitigation

- ✅ TLS 1.2+ wajib (`tls.Config.MinVersion`), tanpa `InsecureSkipVerify`; proxy lingkungan dimatikan.
- ✅ HMAC-SHA256 per-request mengikat method+path+body-hash+timestamp; `X-Correlation-ID` UUIDv7; retry hanya transport/5xx/429.
- ✅ `hmac_secret` tidak pernah di-log; state file `0600` (opsional AES-256-GCM `0600`); `X-Agent-*`/secret tidak masuk payload log.
- ✅ Timeout berlapis (dial 5s / TLS 5s / response-header 10s / total 15s) + `io.LimitReader` (2 MiB respons, 8 MiB stats Docker).
- ✅ exec kosong — tidak ada shell; satu-satunya proses eksternal adalah Docker Engine API via socket/pipe.
- ✅ **FIM**: path tervalidasi absolut + anti symlink-escape (tidak mengikuti symlink keluar root); baseline state `0600` (+ AES-256-GCM opsional); batch ≤ 500 (kontrak W3); interval clamp 1m..24h (anti polling berat).
- ✅ Non-root Linux (`DynamicUser`) & `LocalService` Windows; unit systemd hardening penuh; rate-limit server dihormati (interval clamp 1s..1h).
- ✅ Verifikasi: `go vet ./...` OK (linux+windows), `go test -race ./...` OK, cross-compile `GOOS=linux` & `GOOS=windows` OK.
