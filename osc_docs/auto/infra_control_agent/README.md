# Technical Documentation: Infra Control Agent (`infra_control_agent`)

- **Date**: 2026-11-13
- **Author**: ai-auto (Golang System & Security Engineer)
- **Target Project**: `osc_auto/infra_control_agent`
- **Upstream Rust API & Contract Reference**: `osc_docs/rest/api-w2.md` & `osc_docs/rest/contracts/w2.openapi.yaml` (Wave 2 / Hari 13 SESI 3.1–3.2)
- **Supported Platforms**: Linux (`systemd`, `amd64`/`arm64`) & Windows (`Windows Service`, `amd64`)
- **Clean Architecture Layers Touched**: `domain`, `usecase`, `infrastructure` (`rustapi`, `storage`, `platform`, `execrunner`, `osfile`), `delivery`

## 1. Overview & System Architecture

Agent eksekutor control plane Docker Compose & Nginx (pola Dockge/Arcane + Nginx UI). `osc_rest` TIDAK PERNAH mengeksekusi shell — API hanya men-antrekan dispatch (`DOCKER_STACK_DISPATCH` / `NGINX_VHOST_DISPATCH` pada `activity_logs` dengan `dispatch_ref`); agent ini yang menarik antrean, mengeksekusi dengan validasinya sendiri, dan ack hasil (memutakhirkan status `compose_stacks` / `nginx_virtual_hosts`: `APPLIED|FAILED|ROLLED_BACK`).

Alur per siklus (interval `INFRA_CONTROL_POLL_INTERVAL`, default 10s, eksekusi serial/berurutan):

1. **Docker stack** (`up|down|pull|restart` — enum allowlist ketat):
   - Validasi path **ketat**: `working_dir` wajib absolut, tanpa `..`/`~`/`\`/kontrol-char, `filepath.Clean` + `filepath.Rel` prefix-check terhadap `STACKS_DIR`, dan **deteksi symlink escape** (`filepath.EvalSymlinks` root & target — target yang me-resolve keluar root ditolak).
   - Gerbang struktural kedua untuk `compose.yaml` (≤ 256 KB, `services:` wajib, `include` ditolak, indentasi tab ditolak — penggandaan defense-in-depth dari validator app-level `osc_rest`).
   - Tulis `compose.yaml` + `.env` (mode `0600`, atomik tmp→rename) → jalankan `docker compose -f compose.yaml <cmd>` dengan **argumen eksplisit (tanpa shell)**, output bounded 64 KiB.
2. **Nginx vhost** (`test_reload`):
   - Validasi konfigurasi kedua (≤ 128 KB, brace seimbang di luar komentar & string, blok `server {` wajib, `include` absolut/wildcard tanpa traversal).
   - Tulis konfigurasi kandidat `<vhost_id>.conf` ke `INFRA_CONTROL_NGINX_CONFIG_DIR` → **`nginx -t` wajib lolos sebelum `nginx -s reload`** → bila `-t` ATAU `reload` gagal: **rollback otomatis** (restore konten lama; bila tidak ada config lama, kandidat dihapus) + validasi ulang `-t` pasca-rollback; hasil ack `ROLLED_BACK` (atau `FAILED` bila rollback pun gagal — pesan meminta review manual).
3. **Push log live** ke `POST /api/v1/agents/logs` (baris ≤ 100 × 2000 char, level `INFO|ERROR`) → LogBroker SSE (`/infra/logs/stream`).
4. **Ack** hasil ke server (idempoten per `dispatch_ref` dalam sesi).

```
delivery.Dispatcher (ticker, graceful shutdown)
  → usecase.Dispatcher
      → usecase.ValidateInsideRoot / ValidateComposeContent / ValidateNginxConfig (pure, tested)
      → domain.FileSystem   (osfile: tulis atomik 0600, EvalSymlinks, rollback)
      → domain.CommandRunner (execrunner: exec args eksplisit, tanpa shell, bounded output)
      → rustapi.Client (HMAC) → osc_rest (fetch outbox / ack / logs)
```

## 2. Directory & Clean Architecture Layout (`osc_auto/infra_control_agent/`)

```text
osc_auto/infra_control_agent/
├── cmd/infra_control_agent/              # main.go + paths_linux/windows.go (STACKS_DIR default)
├── internal/
│   ├── domain/                           # Dispatch/AckResult + port (Source/Ack/Logs/Runner/FS)
│   ├── usecase/                          # Dispatcher + validasi path/compose/nginx + unit test
│   ├── infrastructure/
│   │   ├── rustapi/                      # klien HMAC hardened + enroll/fetch/ack/logs
│   │   ├── storage/                      # state kredensial 0600 (+ AES-256-GCM opsional)
│   │   ├── platform/                     # runner *_linux/*_windows
│   │   ├── execrunner/                   # CommandRunner (exec eksplisit, bounded, timeout)
│   │   └── osfile/                       # FileSystem adapter (atomik, 0600, EvalSymlinks)
│   └── delivery/                         # dispatcher loop periodik
├── configs/infra_control_agent.env.example
└── deploy/
    ├── linux/infra_control_agent.service
    └── windows/install-service.ps1
```

## 3. Upstream Rust API (`osc_rest`) Integration Contract

| Endpoint / WS (`osc_rest`) | Method / Proto | Auth Mechanism | Retry & Timeout Policy | Payload / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/agents/enroll` | `POST` | Public (enrollment token) | Timeout `15s`, 3× backoff+jitter | Tukar token → `agent_id`, `hmac_secret` (sekali), `company_id` |
| `/api/v1/agents/infra/dispatches` | `GET` | `HMAC-SHA256` + `X-Correlation-ID` | Timeout `15s`, 3× backoff | Baca outbox dispatch pending (`dispatch_ref`, `kind`, `command`, payload stack/vhost) |
| `/api/v1/agents/infra/dispatches/{ref}/ack` | `POST` | `HMAC-SHA256` | Timeout `15s`, 3× backoff | `APPLIED|FAILED|ROLLED_BACK` + `last_error` → status stack/vhost |
| `/api/v1/agents/logs` | `POST` | `HMAC-SHA256` | Timeout `15s`, 3× backoff | Baris log live docker/nginx → LogBroker SSE |

> **Catatan agent-plane API (gap kontrak W2)**: `w2.openapi.yaml` (SESI 3.1) mendefinisikan sisi REST admin (`/docker/stacks/{id}/dispatch`, `/nginx/vhosts/{id}/dispatch` → antrean `activity_logs`) tetapi belum memuat endpoint baca-outbox/ack untuk agent. Agent mengimplementasikan endpoint plane-agent minimal di atas (`GET /agents/infra/dispatches`, `POST /agents/infra/dispatches/{dispatch_ref}/ack`) yang harus ditambahkan ke router `osc_rest` pada iterasi berikutnya — nama field payload mengikuti entitas kontrak (`dispatch_ref`, `command` enum `up|down|pull|restart|test_reload`, `compose_content`, `config_content`, dst.) agar patch server tetap selaras.

Signature kanonis sama dengan kontrak W2: `"{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}"` (±30 s).

## 4. Cross-Platform Deployment & Service Configuration

- **Linux (`systemd`)**: binary `/usr/local/bin/infra_control_agent` (`DynamicUser=yes` default, atau `User=omni_infra` ber-grup `docker` — lihat komentar unit); `StateDirectory` `0700`; `ProtectSystem=strict` (tulis hanya `STACKS_DIR` + nginx conf dir); hardening unit lengkap; `RestrictAddressFamilies` termasuk `AF_UNIX` untuk Docker socket.
- **Windows (`Windows Service`)**: binary `C:\ProgramData\infra_control_agent\infra_control_agent.exe`, SCM `infra_control_agent` (`LocalService`, recovery 5s/30s/60s); prasyarat Docker Desktop (named pipe) dan nginx for Windows; default `STACKS_DIR=C:\omnisight\stacks`, nginx conf `C:\nginx\conf`.
- **Environment Variables**: `RUST_API_BASE_URL`, `INFRA_CONTROL_POLL_INTERVAL` (5s..10m), `INFRA_CONTROL_STACKS_DIR` (wajib absolut), `INFRA_CONTROL_NGINX_CONFIG_DIR` (wajib absolut), `INFRA_CONTROL_DOCKER_BIN`, `INFRA_CONTROL_NGINX_BIN`, `INFRA_CONTROL_STATE_PATH`, `INFRA_CONTROL_STATE_KEY_HEX`, `INFRA_CONTROL_LOG_LEVEL`.

Perintah build & verifikasi (dari `osc_auto/infra_control_agent/`):

```bash
go vet ./... && GOOS=windows GOARCH=amd64 go vet ./...
go test -race ./...
GOOS=linux GOARCH=amd64 go build -o bin/infra_control_agent ./cmd/infra_control_agent
GOOS=windows GOARCH=amd64 go build -o bin/infra_control_agent.exe ./cmd/infra_control_agent
```

## 5. Security Controls & Threat Mitigation

- ✅ TLS 1.2+ wajib (tanpa `InsecureSkipVerify`), HMAC-SHA256 per-request + `X-Correlation-ID`, retry hanya transport/5xx/429.
- ✅ **Path traversal & symlink escape**: `working_dir`/config path divalidasi ganda (server + agent): absolut, tanpa `..`/`~`/`\`/kontrol-char, prefix `STACKS_DIR`, `EvalSymlinks` root+target — unit test khusus (`traversal`, `symlink escape`, `prefix telanjur`).
- ✅ **Command injection**: API tidak pernah eksekusi shell; agent juga tanpa shell (`exec.CommandContext` argumen eksplisit), command enum allowlist (`up|down|pull|restart|test_reload`) diverifikasi ulang sebelum eksekusi; env proses dibersihkan (hanya `PATH` + `LC_ALL=C`).
- ✅ **Zero-trust konten**: compose/nginx divalidasi ulang di agent (ukuran/struktur) sebelum ditulis atau dieksekusi.
- ✅ **Rollback otomatis nginx**: konten lama disimpan sebelum overwrite; `-t` gagal / reload gagal → restore + validasi ulang; tanpa config lama → kandidat dihapus; rollback gagal → `FAILED` + instruksi review manual.
- ✅ File `0600` atomik (compose, `.env`, konf nginx); state kredensial `0600` + AES-256-GCM opsional; secret tidak pernah di-log.
- ✅ Bounded output proses (64 KiB), timeout 10 mnt per exec, `io.LimitReader` respons, idempoten `dispatch_ref`.
- ✅ Verifikasi: `go vet ./...` OK (linux+windows), `go test -race ./...` OK (dispatcher & validasi path/compose/nginx dengan fake runner/FS), cross-compile `GOOS=linux` & `GOOS=windows` OK.
