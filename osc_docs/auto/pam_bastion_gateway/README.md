# Technical Documentation: PAM Bastion Gateway (`pam_bastion_gateway`)

- **Date**: 2026-11-13
- **Author**: ai-auto (Golang System & Security Engineer)
- **Target Project**: `osc_auto/pam_bastion_gateway`
- **Upstream Rust API & Contract Reference**: `osc_docs/rest/api-w3.md` & `osc_docs/rest/contracts/w3.openapi.yaml` (Wave 3 / Hari 16 SESI 4.1)
- **Supported Platforms**: Linux (`systemd`, `amd64`/`arm64`) & Windows (`Windows Service`, `amd64`)
- **Clean Architecture Layers Touched**: `domain` (ACL, session, errors), `usecase` (bastion, recorder), `infrastructure` (`rustapi`, `ssh`, `wsserver`, `storage`, `platform`), `delivery` (adapter sesi WS)

## 1. Overview & System Architecture

WebSocket-to-SSH bastion proxy (pola JumpServer) yang mengeksekusi sesi terminal yang telah diotorisasi oleh PAM `osc_rest` (mandatory MFA + step-up). Browser (xterm.js) TIDAK PERNAH menerima kredensial target; gateway-lah satu-satunya pihak yang melihat secret (sekali, saat redeem, in-memory).

Alur satu sesi:

1. **Authorize** (di UI/osc_rest): `POST /api/v1/pam/sessions/authorize` (JWT; MFA wajib, step-up OTP 15 menit, CIDR ACL) → `session_id` + `ticket` ephemeral 256-bit (TTL ≤ 120 s, sekali tampil).
2. **Handshake WS**: browser membuka WS `PAM_GATEWAY_WS_PATH` dan mengirim frame pertama `{"session_id","ticket"}`.
3. **Redeem** (HMAC agent): `POST /api/v1/agents/pam/ticket/redeem` → target host/port + username + secret plaintext (sekali, jalur internal). Ticket plaintext di-zero-ize; redeem atomik — ticket kedua kali → `409 CONFLICT`.
4. **Dial SSH** ke target via `x/crypto/ssh` (pty-req + shell; tanpa `exec.Command`). Host key diverifikasi file known_hosts dengan pola **TOFU** — first use dicatat (atomik + fsync), mismatch berikutnya = tolak keras (anti MITM). Secret di-zero-ize setelah auth.
5. **Pump real-time + Command ACL Blacklist**: input browser dibuffer sampai newline; setiap baris penuh dievaluasi terhadap `policy.command_filter.deny` sebelum diteruskan — **baris yang diblokir tidak pernah mencapai remote**. Entri `re:<regex>` dicocokkan case-insensitive atas seluruh baris; entri nama perintah dicocokkan pada token pertama setelah strip `sudo/doas/env VAR=`, basename path; karakter kontrol/ANSI distrip (anti filter evasion). Entri `confirm` ditolak deny-by-default (workflow approval W4); regex malformed = deny (fail-safe).
6. **Session recording**: event asciicast v2 (output remote + input yang lolos ACL) dikompresi gzip (CAST_GZ, batas 100 MB, sha256 inkremental) lalu diunggah `POST /api/v1/pam/sessions/{id}/recording?format=CAST_GZ` (HMAC atas `sha256(body)`) → bucket privat RustFS `RUSTFS_BUCKET_PAM` — DB hanya menyimpan pointer (`recording_object_key`).
7. Sesi dibatasi `policy.max_session_minutes` (cap 480), diakhiri graceful (drain output, upload rekaman, tutup WS).

```
browser (xterm.js) ──WS──▶ wsserver ──▶ delivery.ServeSession
                                            ▼
                                     usecase.BastionService
                                     ├─ rustapi.Client (HMAC) ──▶ osc_rest (redeem, upload)
                                     ├─ ssh.Dialer ──────────────▶ target SSH
                                     └─ usecase.Recorder ──CAST_GZ─┘
```

## 2. Directory & Clean Architecture Layout (`osc_auto/pam_bastion_gateway/`)

```text
osc_auto/pam_bastion_gateway/
├── cmd/pam_bastion_gateway/main.go   # entrypoint, DI wiring, --enroll/--run-console/--version
├── internal/
│   ├── domain/                       # session/redeem/policy, acl.go (murni), errors
│   ├── usecase/                      # bastion.go (orkestrasi sesi), recorder.go (CAST_GZ) + test
│   ├── infrastructure/
│   │   ├── rustapi/                  # klien HMAC-SHA256 hardened + enroll/redeem/upload
│   │   ├── ssh/                      # dial.go — x/crypto/ssh, PTY, known_hosts TOFU, zero-ize
│   │   ├── wsserver/                 # server WebSocket (origin check, batas ukuran frame)
│   │   ├── storage/                  # state kredensial 0600 (+ AES-256-GCM opsional)
│   │   └── platform/                 # runner.go + service_linux.go / service_windows.go
│   └── delivery/                     # adapter sesi WS → usecase
├── configs/pam_bastion_gateway.env.example
└── deploy/
    ├── linux/pam_bastion_gateway.service
    └── windows/install-service.ps1
```

## 3. Upstream Rust API (`osc_rest`) Integration Contract

| Endpoint / WS (`osc_rest`) | Method / Proto | Auth Mechanism | Retry & Timeout Policy | Payload / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/agents/enroll` | `POST` | Public (enrollment token) | Timeout `15s`, 3× exp. backoff+jitter | Tukar token → `agent_id`, `hmac_secret` (sekali), `company_id` |
| `/api/v1/agents/pam/ticket/redeem` | `POST` | `HMAC-SHA256` + `X-Correlation-ID` | Timeout `15s`, 3× backoff (transport/5xx/429); `409`/`401` tidak diretry | `{session_id, ticket}` → target host/port + akun + secret plaintext (sekali) + policy `command_filter`/`max_session_minutes` |
| `/api/v1/pam/sessions/{id}/recording?format=CAST_GZ` | `POST` | `HMAC-SHA256` (kanonis mengikat `sha256_hex(body)`) | Timeout `15s`, 3× backoff | Body biner gzip asciicast → RustFS `RUSTFS_BUCKET_PAM`, respons `object_key/sha256/size_bytes` |

Signature HMAC kanonis: `hex(HMAC-SHA256(secret, "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}"))` dengan header `X-Agent-Id`, `X-Agent-Timestamp` (±30 s), `X-Agent-Signature`.

## 4. Cross-Platform Deployment & Service Configuration

- **Linux (`systemd`)**: binary `/usr/local/bin/pam_bastion_gateway` (non-root `DynamicUser=yes`, `StateDirectory=pam_bastion_gateway` 0700); unit `deploy/linux/pam_bastion_gateway.service` dengan hardening lengkap (`ProtectSystem=strict`, `MemoryDenyWriteExecute`, `RestrictAddressFamilies=AF_INET AF_INET6`).
- **Windows (`Windows Service`)**: binary `C:\ProgramData\pam_bastion_gateway\pam_bastion_gateway.exe`; service SCM `pam_bastion_gateway` sebagai `NT AUTHORITY\LocalService` (`sc.exe failure` restart 5s/30s/60s); deteksi SCM otomatis (`svc.IsWindowsService`), `--run-console` memaksa mode console; ACL data dibatasi LocalService+Administrators via `deploy/windows/install-service.ps1`.
- **Environment Variables**: `RUST_API_BASE_URL`, `PAM_GATEWAY_LISTEN` (default `:8090`), `PAM_GATEWAY_WS_PATH` (default `/gateway/ws`), `PAM_GATEWAY_ALLOWED_ORIGINS` (CSV; **kosong = same-origin saja** — anti CSWSH), `PAM_GATEWAY_MAX_SESSIONS` (1..1000), `PAM_GATEWAY_KNOWN_HOSTS` (kosong = semua dial ditolak, fail-safe), `PAM_GATEWAY_RECORDING_DIR` (dump lokal opsional), `PAM_GATEWAY_STATE_PATH`, `PAM_GATEWAY_STATE_KEY_HEX`, `PAM_GATEWAY_LOG_LEVEL` (lihat `configs/pam_bastion_gateway.env.example`).

Perintah build & verifikasi (dari `osc_auto/pam_bastion_gateway/`):

```bash
go vet ./... && GOOS=windows GOARCH=amd64 go vet ./...
go test -race ./...
GOOS=linux GOARCH=amd64 go build -o bin/pam_bastion_gateway ./cmd/pam_bastion_gateway
GOOS=windows GOARCH=amd64 go build -o bin/pam_bastion_gateway.exe ./cmd/pam_bastion_gateway
```

## 5. Security Controls & Threat Mitigation

- ✅ **Kredensial tidak pernah ke browser**: secret target (`secret` redeem) hidup di memori sesi (`[]byte`, di-zero-ize pasca auth SSH); frame WS hanya berisi output remote & notice; ticket di-zero-ize pasca redeem.
- ✅ **Ephemeral ticket sekali pakai**: redeem atomik server-side (`AUTHORIZED → ACTIVE`); double-redeem `409`; ticket tidak di-log.
- ✅ **Command ACL Blacklist real-time**: buffer newline → evaluasi baris penuh SEBELUM forward; deny menang; `confirm` deny-by-default; regex malformed = deny; strip kontrol/ANSI + `sudo/env` + basename (anti evasion); semua blok tercatat di log audit + rekaman.
- ✅ **SSH host key TOFU**: known_hosts 0600, first-use dicatat atomik, mismatch = tolak keras; `PAM_GATEWAY_KNOWN_HOSTS` kosong = semua koneksi ditolak (fail-safe).
- ✅ **Origin check WS** (allowlist; kosong = same-origin saja — anti CSWSH) + batas sesi konkuren + batas ukuran frame input (32 KiB, buffer baris 16 KiB — overflow dibuang).
- ✅ TLS 1.2+ ke osc_rest, tanpa `InsecureSkipVerify`, proxy dimatikan, timeout berlapis, `io.LimitReader` 2 MiB, 3× backoff full-jitter (crypto/rand), `X-Correlation-ID` UUIDv7.
- ✅ Rekaman immutable: CAST_GZ + sha256 → bucket privat RustFS; rekaman TIDAK memuat secret (SSH auth terjadi sebelum recorder aktif).
- ✅ State `0600` (opsional AES-256-GCM), log JSON `slog` tanpa ticket/secret/hmac; non-root Linux (`DynamicUser`) & `LocalService` Windows; tanpa `exec.Command` (PTY via `x/crypto/ssh`).
- ✅ Verifikasi: `go vet ./...` OK (linux+windows), `go test -race ./...` OK (ACL + bastion), cross-compile `GOOS=linux` & `GOOS=windows` OK.
