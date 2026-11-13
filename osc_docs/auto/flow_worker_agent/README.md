# Technical Documentation: Flow Worker Agent (`flow_worker_agent`)

- **Date**: 2026-11-13
- **Author**: ai-auto (Golang System & Security Engineer)
- **Target Project**: `osc_auto/flow_worker_agent`
- **Upstream Rust API & Contract Reference**: `osc_docs/rest/api-w3.md` & `osc_docs/rest/contracts/w3.openapi.yaml` (Wave 3 / Hari 16 SESI 4.1) + `osc_docs/reengineering.md` bab 5.8 (Centralized Notification Dispatcher & Data Retention Policy)
- **Supported Platforms**: Linux (`systemd`, `amd64`/`arm64`) & Windows (`Windows Service`, `amd64`)
- **Clean Architecture Layers Touched**: `domain` (message/channel/template + port), `usecase` (dispatcher, retention), `infrastructure` (`rustapi`, `smtp`, `telegram`, `webhook`, `httpx`, `queue`, `listener`, `storage`, `platform`), `delivery` (adapter listener HTTP)

## 1. Overview & System Architecture

Worker asinkron lintas-platform — eksekutor **Centralized Notification Dispatcher** (bab 5.8) sekaligus pemicu **Data Retention Cleanup**:

1. **Inbound listener enqueue** (`POST /api/v1/flow/enqueue`): produsen (`osc_rest` menulis antrean outbox, atau agent lain) mengirim batch pesan yang ditandatangani HMAC-SHA256 shared secret (`X-Flow-Timestamp` ±30 s + `X-Flow-Signature` atas kanonis `{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}`). Tanpa secret valid, listener **menolak start** (deny-by-default). Setiap pesan membawa `event_id` (kunci dedupe), kode event, dan daftar channel target beserta config-nya.
2. **Antrean durable lokal** (file JSON atomik 0600, opsional AES-256-GCM): dedupe `event_id` (set LRU 4096), backpressure (maks 10.000 pending), retry dengan `attempts`+`next_attempt_at`, dead-letter counter. Redelivery produsen tidak menyebabkan pengiriman ganda.
3. **Dispatcher (bounded worker pool)**: N worker (`FLOW_WORKER_WORKERS`, default 4) mengirim pesan ke channel via registry sender; sukses → `ack`, gagal → retry exponential backoff + full jitter (30 s × 2^attempt, plafon 15 menit), habis `FLOW_WORKER_MAX_ATTEMPTS` (default 5) → dead-letter (dihitung di log).
4. **Sender per tipe channel** (kontrak `w3.openapi.yaml` `ChannelConfig`):
   - `SMTP_EMAIL` — `net/smtp` stdlib: port 465 → implicit TLS sejak handshake; port lain + `use_tls` → **STARTTLS wajib**; AUTH PLAIN hanya setelah sesi terenkripsi; header RFC 5322 dengan anti header-injection (CRLF strip) + `Message-ID` dari `event_id` (idempoten-aman).
   - `TELEGRAM` — Bot API `sendMessage` (text ≤ 4096, parse_mode allowlist HTML/Markdown/MarkdownV2); bot token hanya di URL request, tidak pernah di-log.
   - `WEBHOOK` — POST JSON generik `{event, event_id, subject, body, data}` atau payload Slack-compatible (`{"text": …}` bila `slack=true`); URL wajib http(s) ≤ 500 tanpa kredensial inline; bila `secret` diset → header signing `X-OmniSign: sha256=<hex(HMAC-SHA256(secret, body))>`; redirect tidak diikuti.
   - Template per event dirender di layer domain (murni): `MFA.RESET_TOKEN` (email token reset MFA sekali pakai + TTL), `UPTIME.DOWN`/`UPTIME.UP` (downtime), `ALERT.FIRING` (termasuk **disk penuh**), `SIEM.CRITICAL`, `ALERT.RESOLVED`, `PAM.SESSION_AUTHORIZED`, `RETENTION.PURGE`, `WEBHOOK.OUTBOUND`. `event_filter` channel dihormati (channel tanpa langganan dilewati).
5. **Data Retention Cleanup terjadwal** (`FLOW_WORKER_RETENTION_INTERVAL`, default 24h): `POST /api/v1/agents/retention/purge` (HMAC agent + allowlist env `RETENTION_PURGE_AGENT_IDS` di server — deny-by-default). Kebijakan 30–90 hari (metrik tier-1m 30, tier-10m 90, heartbeat 30, SecOps 365) **dikelola & di-clamp server-side**; agent mengatur jadwal, flag `dry_run`, dan melaporkan hitungan per tabel. Hasil juga bisa dikirim sebagai notifikasi `RETENTION.PURGE` oleh produsen.

```
osc_rest (outbox) ──HMAC──▶ listener :8095 ──▶ queue (durable, AES-GCM opsional)
                                                    ▼
                                       usecase.Dispatcher (N workers)
                                       ├─ smtp.Sender      ──▶ SMTP (implicit TLS / STARTTLS)
                                       ├─ telegram.Sender  ──▶ Bot API
                                       └─ webhook.Sender   ──▶ HTTP(S) / Slack
usecase.RetentionJob ──HMAC──▶ osc_rest /agents/retention/purge (harian)
```

## 2. Directory & Clean Architecture Layout (`osc_auto/flow_worker_agent/`)

```text
osc_auto/flow_worker_agent/
├── cmd/flow_worker_agent/
│   ├── main.go               # entrypoint, DI wiring, --enroll/--run-console/--version
│   └── helpers.go            # parser env (durasi/int/bool) + default path
├── internal/
│   ├── domain/               # notification.go (message/channel/template + port), agent.go, errors.go — murni
│   ├── usecase/              # dispatcher.go (worker pool+retry), retention.go (job harian) + test
│   ├── infrastructure/
│   │   ├── rustapi/          # klien HMAC-SHA256 hardened + enroll/purge (osc_rest)
│   │   ├── smtp/             # sender SMTP (implicit TLS/STARTTLS, auth post-TLS)
│   │   ├── telegram/         # sender Bot API
│   │   ├── webhook/          # sender webhook/Slack (+ HMAC header X-OmniSign)
│   │   ├── httpx/            # klien HTTP outbound bersama (TLS 1.2+, no redirect, LimitReader)
│   │   ├── queue/            # antrean durable lokal (atomic rename, AES-GCM opsional) + test
│   │   ├── listener/         # server HTTP enqueue ber-HMAC + healthz + test
│   │   ├── storage/          # state kredensial 0600 (+ AES-256-GCM opsional)
│   │   └── platform/         # runner.go + service_linux.go / service_windows.go
│   └── delivery/             # adapter listener → antrean domain
├── configs/flow_worker_agent.env.example
└── deploy/
    ├── linux/flow_worker_agent.service
    └── windows/install-service.ps1
```

## 3. Upstream Rust API (`osc_rest`) Integration Contract

| Endpoint / WS (`osc_rest`) | Method / Proto | Auth Mechanism | Retry & Timeout Policy | Payload / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/agents/enroll` | `POST` | Public (enrollment token) | Timeout `15s`, 3× exp. backoff+jitter | Tukar token → `agent_id`, `hmac_secret` (sekali), `company_id` |
| `/api/v1/agents/retention/purge` | `POST` | `HMAC-SHA256` + `X-Correlation-ID` (+ allowlist env `RETENTION_PURGE_AGENT_IDS` server — deny-by-default) | Timeout `15s`, 3× backoff (transport/5xx/429); `403` tidak diretry (log peringatan konfigurasi) | `{dry_run}` → 202 `{purged: {system_metric_snapshots: n, …}}` |
| (inbound) `POST /api/v1/flow/enqueue` | `POST` | HMAC shared secret `X-Flow-Timestamp`/`X-Flow-Signature` (window ±30 s) | Body ≤ 1 MiB; batch ≤ 200 pesan | `{messages: [{event_id, event, subject?, body?, data?, channels: [{type, config, to, event_filter}]}]}` → 202 `{enqueued, deduplicated}` |

Signature HMAC kanonis (arah outbound): `hex(HMAC-SHA256(secret, "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}"))` dengan header `X-Agent-Id`, `X-Agent-Timestamp` (±30 s), `X-Agent-Signature` — tervalidasi vektor tetap di test.

## 4. Cross-Platform Deployment & Service Configuration

- **Linux (`systemd`)**: binary `/usr/local/bin/flow_worker_agent` (non-root `DynamicUser=yes`, `StateDirectory=flow_worker_agent` 0700 untuk state + antrean); unit `deploy/linux/flow_worker_agent.service` dengan hardening lengkap (`ProtectSystem=strict`, `MemoryDenyWriteExecute`, `RestrictAddressFamilies=AF_INET AF_INET6` — tidak butuh AF_UNIX).
- **Windows (`Windows Service`)**: binary `C:\ProgramData\flow_worker_agent\flow_worker_agent.exe`; service SCM `flow_worker_agent` sebagai `NT AUTHORITY\LocalService` (`sc.exe failure` restart 5s/30s/60s, reset 24 jam); deteksi SCM otomatis (`svc.IsWindowsService`), `--run-console` memaksa mode console; ACL data dibatasi LocalService+Administrators via `deploy/windows/install-service.ps1`.
- **Environment Variables**: `RUST_API_BASE_URL`, `FLOW_WORKER_LISTEN_ENABLED`, `FLOW_WORKER_LISTEN` (default `:8095`), `FLOW_WORKER_LISTEN_SECRET_HEX` (**wajib** saat listener aktif — tanpa itu agent menolak start), `FLOW_WORKER_WORKERS`, `FLOW_WORKER_MAX_ATTEMPTS`, `FLOW_WORKER_DISPATCH_INTERVAL`, `FLOW_WORKER_QUEUE_PATH`, `FLOW_WORKER_QUEUE_KEY_HEX` (AES-256-GCM antrean — disarankan), `FLOW_WORKER_RETENTION_ENABLED`, `FLOW_WORKER_RETENTION_INTERVAL` (clamp 1h–7d, default 24h), `FLOW_WORKER_RETENTION_DRY_RUN`, `FLOW_WORKER_STATE_PATH`, `FLOW_WORKER_STATE_KEY_HEX`, `FLOW_WORKER_LOG_LEVEL` (lihat `configs/flow_worker_agent.env.example`).

Perintah build & verifikasi (dari `osc_auto/flow_worker_agent/`):

```bash
go vet ./... && GOOS=windows GOARCH=amd64 go vet ./...
go test -race ./...
GOOS=linux GOARCH=amd64 go build -o bin/flow_worker_agent ./cmd/flow_worker_agent
GOOS=windows GOARCH=amd64 go build -o bin/flow_worker_agent.exe ./cmd/flow_worker_agent
```

## 5. Security Controls & Threat Mitigation

- ✅ **Listener deny-by-default**: tanpa `FLOW_WORKER_LISTEN_SECRET_HEX` (64 hex) agent menolak start; HMAC kanonis + window replay ±30 s + `hmac.Equal` (constant-time); body ≤ 1 MiB (`MaxBytesReader`/`LimitReader`); hanya path tunggal; `401/400/413` generik.
- ✅ **Zero secret leakage**: password SMTP / bot token / webhook secret / token reset MFA TIDAK PERNAH di-log (log hanya `event_id`, `event`, hitungan); log JSON `slog` terstruktur.
- ✅ **Antrean terenkripsi opsional namun disarankan** (AES-256-GCM, nonce acak per tulis, tag autentikasi) karena memuat config channel ber-secret; file & state `0600`, direktori `0700`, atomic tmp→rename.
- ✅ **Idempotensi**: dedupe `event_id` (set LRU 4096) — email reset MFA sekali pakai tidak terkirim ganda saat redelivery; `Message-ID` SMTP dari `event_id`.
- ✅ **SMTP hardening**: implicit TLS (465) atau STARTTLS wajib; auth hanya setelah TLS; `ServerName` eksplisit (anti MITM); header injection di-sanitasi.
- ✅ **Webhook hardening**: URL http(s) ≤ 500 tanpa kredensial inline (kontrak w3); redirect tidak diikuti; HMAC signing body (`X-OmniSign: sha256=…`) bila secret diset.
- ✅ **Klien HTTP hardened**: TLS 1.2+ tanpa `InsecureSkipVerify`, timeout berlapis (dial 5s/TLS 5s/header 10s/total 15s), proxy dimatikan, `io.LimitReader` (1 MiB HTTP, 2 MiB osc_rest), 3× backoff full-jitter crypto/rand, `X-Correlation-ID` UUIDv7 (RFC 9562).
- ✅ **Bounded resources**: worker pool 1..64, buffer job 256, antrean maks 10.000 (backpressure `ErrQueueFull`), backoff plafon 15 menit, dead-letter setelah habis percobaan.
- ✅ Non-root Linux (`DynamicUser`) & `LocalService` Windows; tanpa `exec.Command`/shell sama sekali; graceful shutdown (SIGINT/SIGTERM/SCM Stop) — worker pool drain in-flight sebelum exit.
- ✅ Verifikasi: `go vet ./...` OK (linux+windows), `go test -race ./...` OK (dispatcher retry/dead-letter/dedupe, antrean durable+enkripsi+backpressure, listener HMAC vektor), cross-compile `GOOS=linux` & `GOOS=windows` OK.
