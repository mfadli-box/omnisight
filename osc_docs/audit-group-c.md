# Audit Statis Grup C & D: `dockge`, `arcane`, `beszel`, `wazuh`, `jumpserver`

- **Date**: 2026-11-12
- **Author**: ai-main (PM, System Analyst & Docker DevOps Architect) — dengan delegasi audit statis 5 subagen paralel
- **Source Target**:
  - `dockge` — https://github.com/louislam/dockge @ `0329dab` (2026-11-12) — Node ≥22/TS/ESM + Vue 3, Socket.IO, SQLite (knex/redbean-node) v1.5.0
  - `arcane` — https://github.com/getarcaneapp/arcane @ `1b1c8b1` (2026-11-12) — Go 1.27 (Echo v5 + Huma v2 + Uber Fx, GORM/Goose, SQLite/Postgres) + SvelteKit/Svelte 5
  - `beszel` — https://github.com/henrygd/beszel @ `83a4944` (2026-11-12) — Go hub (PocketBase) + agent (gopsutil v4) v0.21.1, WebSocket+SSH/CBOR
  - `wazuh` — https://github.com/wazuh/wazuh @ `c5fe976` (2026-11-12) — **Wazuh 5.1.0-alpha0**: C/C++ engine (C++17, RocksDB/FlatBuffers) + Python API/framework, arsitektur 5.x (bukan 4.x XML)
  - `jumpserver` — https://github.com/jumpserver/jumpserver @ `5cb4034` (2026-11-12) — Python ≥3.14 + Django 5.2 monolith, Celery 5.6, Redis, Postgres v4.0
- **Scope**: Re-engineering audit — manajemen `compose.yaml` & container lifecycle (dockge/arcane), kolektor metrik host/container (beszel), FIM/SIEM/CVE (wazuh), arsitektur PAM bastion gateway (jumpserver)
- **Aturan**: `git clone --depth 1` ke `.rea_docs/` (gitignored, `git status` bersih per repo) — **inspeksi statis murni**, tidak ada `npm/go/pip install`, build, atau eksekusi script apa pun (anti supply-chain)
- **Delegasi**: analisis mendalam via 5 subagen `explore` paralel (1 repo / subagen)
- **Checklist Ref**: `osc_docs/checklist.md` — Hari 3 (`SESI 0.3`)
- **Rekan Audit**: `osc_docs/audit-group-a.md`, `osc_docs/audit-group-b.md`

---

## 1. Executive Summary

| Repo | Stack | Lapisan yang diaudit | Pola inti yang harus dipindahkan |
| :--- | :--- | :--- | :--- |
| `dockge` | Node/TS + Socket.IO + SQLite (redbean-node) | Manajemen compose stack & lifecycle | **Docker via CLI child-process + PTY** (bukan dockerode); stack = direktori `stacksDir/<nama>/compose.yaml` (4 nama file diterima) + `.env` lazily-read; status stack derived live dari `docker compose ls --format json` (stack TIDAK ada di DB); croner polling 10 s; terminal named-registry dengan mutual exclusion (`Terminal.exec` satu operasi per stack), buffer replay `LimitQueue(100)`, keep-alive 60 s; validasi = regex nama `^[a-z0-9_-]+$` (juga guard path traversal) + `yaml.parse` sintaks; `global.env` shared via `--env-file`; JWT dengan binding `shake256(passwordHash)` (ganti password membatalkan token); agent mesh = socket.io-client antar instance (kredensial **plaintext** di tabel `agent`); tanpa RBAC |
| `arcane` | Go (Echo v5 + Huma v2 + Fx, GORM+Goose, SQLite/Postgres) + SvelteKit 5 | Compose project lifecycle, drift, auto-update, multi-env | Stack = **project**: row DB `projects` + file compose on-disk; parsing via **compose-go v2 loader**, deploy via **docker/compose/v5 Go lib** (bukan CLI); env berlapis (`.env.global`, `.env`, `.env.git`, `project.env`) dengan mtime-cache; drift detection via **tripwire filesystem watcher** + reconcile status (`partially_running`/`deploying`, recovery stuck-status, redeploy journal di KV); redeploy ber-journal (backup rename `-arcane-redeploy-` + rollback); image update 2 lapis (`image_updates` digest/tag polling + `auto_update_records` watchtower-style apply dengan admission leases, flow workflow resumable via francis); docker events bus reconnector backoff 500ms→30s; remote env = **agent dial-out gRPC/WebSocket tunnel + yamux** (bukan inbound), enrollment token, mTLS opsional, socket-proxy pattern; JWT di-sign **ML-DSA (post-quantum)**, API key hashed+prefix, RBAC env-scoped (permission dari URL path), CSRF + rate-limit per-IP/per-token |
| `beszel` | Go hub (PocketBase/SQLite) + agent (gopsutil v4) | Kolektor metrik host/container & alerting | Hub↔agent: **WebSocket preferred (agent dial-out, ed25519 challenge-signature) + SSH fallback (hub = SSH client, agent = SSH server gliderlabs/ssh)**, wire CBOR (`HubRequest/AgentResponse`); pull 60 s dengan jitter + cache per-`cacheTimeMs` (delta metrics keyed per interval agar realtime tak merusak window 60 s); metrik: CPU per-core+breakdown(user/sys/iowait/steal), mem+ZFS ARC, disk+IO delta, net via DeltaTracker + NIC filter, sensor/fan/battery/wifi, GPU (NVML/ROCm/Intel), container stats via **HTTP satu-shot ke docker socket** (`stats?stream=0&one-shot=1`, tanpa docker events), systemd, SMART, package updates; timeseries tier **1m→10m→20m→120m→480m** (min sample guard) + retensi berjenjang (1m→1h … 480m→30d); alert evaluasi digabung ke poll 60 s dengan **rata-rata N-menit + histeresis** `triggered`; notifikasi email + webhook shoutrrr + quiet hours; provisioning via YAML config / universal token; fingerprint = sha256(machine-id) pinned |
| `wazuh` | C/C++ engine + Python API/framework (**v5.1.0-alpha0**) | FIM, SIEM rules, CVE/VD, agent protocol | **Arsitektur 5.x baru**: `analysisd` diganti **`src/engine`** (C++17: router Orchestrator, builder aset→expression tree, bk RxCpp/Taskflow, dekoder YAML+logpar, kvdb/RocksDB IOC, geo MaxMind); **tidak ada lagi XML rules/decoders** — deteksi dipisah: engine mendekode & meng-index `wazuh-events-v5-<category>`, **Sigma YAML detectors di Wazuh Indexer** (fork OpenSearch Security Analytics) menghasilkan `wazuh-findings-v5-<category>`; FIM (syscheckd) dual-event: realtime inotify/ReadDirectoryChangesW + who-data auditd/SACL, stateful via **Agent Sync Protocol** → remoted `/stateful`, FIMDB = DBSync/SQLite (`file_entry`, `registry_key`, `registry_data` — checksum MD5/SHA1/SHA256 + attrs); VD = `vulnerability_scanner` (RocksDB feed dari CTI/CVE5 via content_manager, FlatBuffers cve5/candidate/description/remediations, ScanOrchestrator Chain-of-Responsibility memetakan inventory syscollector ↔ feed, severity dari CVSS flatbuffer); remoted: HTTPS 1517 TLS1.3 + JWT per-agent HS256 (self-signed client.keys) + legacy AES 1514; protokol wire `x-wev1` NDJSON; cluster master/worker Python (integrity sync 8–9 s, DAPI forwarding); RBAC orm.py roles/policies/resources |
| `jumpserver` | Django 5.2 monolith + Celery + Redis + Postgres | PAM bastion gateway & session audit | PAM v4: kredensial di app **`accounts`** terpisah (`Account` per-asset, `secret_type`, template/personal/virtual account) — enkripsi at-rest 2 lapis: `VaultSecretField` (AES-GCM keyed dari `SECRET_KEY`, opsi SM4) + external vault backend (local/OpenBao/HCP/AWS/Azure) dengan marker `# Secret-has-been-saved-to-vault #`; **Gateway = proxy model atas SSH asset internal** (tunnel via sshtunnel/paramiko), Zone = CIDR assignment; otorisasi terpusat di **`ConnectionToken`**: validasi `AssetPermission` (users/user_groups × assets/nodes × accounts JSON `@ALL/@INPUT/@USER/!name`, actions BitChoices connect/upload/download/copy/paste/delete/share, window `date_start–date_expired`) + `LoginAssetACL` staging (reason/mfa/review-ticket/face/push_account); komponen **koko/lion(guacamole)/magnus(DB)/razor/tinker/chen/kael** meregistrasi via `Bootstrap token` → service account → fetch secret via API signed `X-JMS-SVC` (AES-ECB timestamp) — **komponen tidak pernah akses DB langsung**; Session/Command/Replay di app `terminal` dengan storage pluggable (DB/Elasticsearch/S3-compatible — RustFS expressible); command filter (regex/command, deny=0/confirm=2/allow=9 + reviewers); MFA 6 backends (TOTP/SMS/email/RADIUS/passkey/face), LDAP/CAS/OIDC/SAML/RADIUS, login-limit + captcha; Celery queue terpisah `ansible` (rotasi password via ansible-runner batch 80) |

Kelima sistem adalah referensi utama **Wave 2–3 omnisight**: agent Golang `infra_control` (Hari 14) & Rust docker control plane (Hari 13) ← dockge/arcane; `host_telemetry` (Hari 14) ← beszel; Rust SIEM/FIM/CVE ingest + PAM vault AES-256-GCM (Hari 17) ← wazuh/jumpserver; agent `pam_bastion_gateway` (Hari 18) & Web SSH xterm.js + session replay (Hari 19) ← jumpserver/koko. Detail per repo:

---

## 2. Dockge — Manajemen Compose Stack & Container Lifecycle

### 2.1 Model stack (filesystem-first, DB-minimal)
- **Stack TIDAK dipersist di database** — satu-satunya sumber kebenaran adalah filesystem: `<stacksDir>/<nama>/compose.yaml` (+ `.env`). `stacksDir` default `/opt/stacks` (Linux), override `--stacksDir` / `DOCKGE_STACKS_DIR`.
- Nama file compose diterima (`common/util-common.ts:acceptedComposeFileNames`): `compose.yaml`, `docker-compose.yaml`, `docker-compose.yml`, `compose.yml` — diprobe berurutan oleh konstruktor `Stack`.
- Status enum: `UNKNOWN=0, CREATED_FILE=1` (draft), `CREATED_STACK=2, RUNNING=3, EXITED=4`.
- Discovery (`Stack.getStackList`): readdir + filter direktori yang memuat compose file → cache in-memory `managedStackList` → merge dengan stack eksternal via `docker compose ls --all --format json` (child process), status diparse `statusConvert()` dari string `"exited(1), running(1)"`.
- Tabel DB hanya 3 (migrasi knex): `user` (username unique, password bcrypt, twofa_*), `setting` (key unique, value JSON-stringified, cache 60 s — termasuk `jwtSecret`), `agent` (url/username/**password plaintext**/name). Pragma SQLite: `foreign_keys=ON, journal_mode=WAL, synchronous=NORMAL`, single connection.

### 2.2 Manajemen compose.yaml
- Parsing: paket `yaml` 2.3.4 — `yaml.parse()` untuk validasi sintaks, `parseDocument()` untuk AST pelestarian komentar; `composerize` mengubah `docker run` → compose YAML (socket event `composerize`).
- **Validasi sebelum apply 2 lapis**: frontend `yamlToJSON()` (parse error throw; `services` wajib objek, deploy ditolak jika kosong) + backend `Stack.validate()`: regex nama `^[a-z0-9_-]+$` (sekaligus **guard path traversal**), `yaml.parse` (sintaks saja — **tanpa validasi skema compose / `docker compose config` dry-run**), sanity `.env` (baris tunggal harus mengandung `=`).
- **Env substitution**: aktual dilakukan `docker compose` CLI via `--env-file` (`getComposeOptions` menyuntik `../global.env` global + `./.env` per-stack). Substitusi `${VAR}` di frontend hanya untuk preview resolved (`envsubstYAML` + `dotenv.parse` + `@inventage/envsubst`).
- **Simpan non-atomik**: `Stack.save()` = `fs.writeFileSync` langsung (tanpa temp+rename, tanpa fsync, tanpa file-lock; hanya operasi docker yang di-mutex). Caveat: `composeENV` tidak ditulis ulang oleh `save()` (asimetri).
- Rename stack **tidak diimplementasi** (tombol UI disembunyikan `v-if="false"`) — nama = nama direktori, immutable.

### 2.3 Container lifecycle (via Docker CLI + PTY — bukan Docker API)
- Mekanisme tunggal: **child process `docker` CLI** — `promisify-child-process` untuk query read-only (`compose ls/ps --format json`, `network ls`, `stats --no-stream`), **node-pty** untuk semua operasi mutasi agar output streaming ke terminal browser.
- Operasi stack (semua lewat named terminal, gagal non-zero → throw "check the terminal output"): deploy/start `compose up -d --remove-orphans`, stop `compose stop`, restart, down, delete (`down --remove-orphans` + `rm -rf` dir), update (`compose pull` lalu `up -d` bila RUNNING). Service-level: `up -d|stop|restart <service>`.
- **Mutual exclusion**: `Terminal.exec` menolak nama terminal duplikat ("Another operation is already running") — satu operasi deploy/stop per stack per waktu.
- Monitoring loop: **croner `*/10 * * * * *`** (10 s, `protect: true` anti-overrun) → `sendStackList(true)` broadcast `stackList` ke socket ber-userID; status per-service dari NDJSON `compose ps` (Health||State); stats host via `docker stats --format json --no-stream`.
- Logs: combined `docker compose logs -f --tail 100` di PTY named `combined-<endpoint>-<stack>`, buffer replay `LimitQueue(100)` chunk, auto-close 60 s tanpa klien (keep-alive). Exec interaktif: `InteractiveTerminal` → `docker compose exec <svc> sh` + `terminalInput` keystrokes. Host shell `MainTerminal` **mati secara default** (`enableConsole: false`).

### 2.4 Auth & security model
- bcryptjs (cost 10) + JWT: secret = bcrypt-hash dari string acak 64-char disimpan di `setting.jwtSecret`; payload `{username, h: shake256(passwordHash,16)}` — **binding token ke hash password** sehingga ganti password membatalkan token lama. 2FA TOTP; rate limiter login 20/menit; setup first-user; `doubleCheckPassword` untuk operasi sensitif.
- Socket auth **bukan middleware**: tiap handler memanggil `checkLogin(socket)` (`socket.userID` truthy). Origin check: header `Origin` browser harus sama host dengan `Host` (allowRequest), bypass di dev.
- **Agent mode**: instance Dockge lain didial sebagai socket.io-client dengan login username/password biasa (kredensial **plaintext** di tabel `agent`); envelope event `"agent"` meroute local / broadcast `##ALL_DOCKGE_ENDPOINTS##` / proxy per-endpoint. Tanpa mTLS/custom CA.
- **Tanpa RBAC** — satu level: semua user login bisa semua stack/agent/setting. Tanpa proteksi konten compose (bind mount host path bebas).

### 2.5 Temuan gap untuk target omnisight
- Perbaiki di target (`osc_auto/infra_control` + Rust control plane): validasi skema compose sebelum deploy, penulisan file **atomik (tmp+rename+fsync)** dengan lock, persist metadata stack di Postgres (jangan filesystem-only), kredensial remote terenkripsi (Envelope AES-256-GCM), RBAC per-stack, docker API client (bukan parse CLI JSON), rename stack + drift detection ala arcane.

---

## 3. Arcane — Compose Project Lifecycle, Auto-Update & Multi-Environment

### 3.1 Arsitektur
- Go workspace 3 modul (`backend`, `cli`, `types`); backend Echo v5 + **Huma v2** (typed REST/OpenAPI, SSE), DI Uber **Fx**; ~50 domain `internal/<domain>/{module,service,model,handler}.go`; frontend SvelteKit/Svelte 5 di-embed ke binary Go; CLI (Cobra, Charm TUI) murni REST client tanpa logika Docker.
- DB: GORM + **Goose** migrations (baseline 94), SQLite (WAL) default / Postgres via `ARCANE_DATABASE_URL`; PK UUID text `BaseModel`; docker state **tidak pernah dipersist** — live query coalesced (singleflight + invalidate on event).

### 3.2 Manajemen compose ("Projects")
- `pkg/projects/load.go`: `LoadComposeProject` via **compose-go/v2 loader** (interpolasi, template, lenient mode untuk placeholder undefined); `ValidateComposeRequest` pra-deploy; kandidat file compose/override + `.env`.
- Deploy via **docker/compose/v5 Go library** (bukan CLI) — `ComposeUp/Stop/Restart/Create` dibungkus `Coordinator` yang menserialisasi operasi per-project + `KeyedMutex` opLock 30 s.
- **Env berlapis**: `.env.global` (global), `.env` (effective), `.env.git` (source GitOps), `project.env` (override) — `EnvLoader` dengan cache mtime; `AutoInjectEnv` menyuntik env host ke interpolasi.
- Path mapping host↔container (`PathMapper`) dari inspeksi self-container mounts; `EnsureProjectPathUnderRoot` guard traversal; tabel `projects` (Name, Path uniqueIndex, Status `running|stopped|partially_running|unknown|deploying|stopping|restarting`, ImageRefsJSON), `project_tags`, `gitops_syncs` (dengan pre-deploy hook: script di runner image, network mode, mounts, env, timeout).
- **Drift**: `FilesystemWatcherJob` (tripwire) atas direktori projects + template registries → re-sync/reconcile status DB vs disk vs docker; rename journal + `RecoverInterruptedRedeploys`.

### 3.3 Container lifecycle
- Docker via **moby/moby/client v0.6.2** (`DockerClientService`: ping, negosiasi API version, cache + invalidasi non-GET/HEAD, `Call[T]` generic timed, snapshot errgroup fan-out); kompatibilitas **Podman** shims.
- Events: `WatchEvents` reconnector backoff 500ms→30s dengan resume `Since=TimeNano` → `DockerEventBus`.
- Redeploy ber-journal: rename container → `-arcane-redeploy-` backup, pull image baru, recreate dengan host config disanitasi, **rollback** `restoreContainerAfterRedeployFailure`, journal di tabel `kv`.
- Stats live via WS (`container_stats`, `system_stats` SSE/WS dengan refcount+batching), logs demux stdcopy + fan-out hub.
- **Auto-heal job**: restart container unhealthy dengan max-restarts/window baseline.
- **Auto-update 2 lapis**: `image_updates` (digest/tag polling registry via go-containerregistry, dipicu cron + docker events) → `updater` watchtower-style (`auto_update_records`, admission leases per project/container mencegah update paralel, self-update via label, flow workflow francis resumable) + `auto_patch_job` (Copacetic/BuildKit patching CVE image).

### 3.4 Auth & security
- Local (dummy-hash timing defense) / **OIDC** (PKCE, device flow, role mappings) / **passkey WebAuthn** + recovery codes / federated (token replay protection); sesi refresh-token hashed; JWT di-sign **ML-DSA (post-quantum)** jwx v4; MFA gating.
- API key: `key_hash` + prefix, `kind` scoped/personal, binding environment; **RBAC**: permission catalog `pkg/authz` + permission env-scoped yang diturunkan dari URL path (`/api/agents/{envID}/...`), enforced server-side di middleware Huma/Echo.
- Multi-env: tabel `environments` (local = id `"0"`); agent **dial-out gRPC/WebSocket + yamux multiplexing** (16/32 MiB frame caps), transport fallback auto, enrollment token rate-limited 30/10s, mTLS opsional dengan CA key terenkripsi `ARCANE-ENC-V1:`; header identitas di-strip dan di-set ulang server-side; pola deploy **socket-proxy** (Tecnativa whitelisted) tersedia sebagai contoh.
- CSRF middleware, CORS, rate limit per-IP/per-token pada endpoint auth/enrollment/webhook.

### 3.5 Temuan kunci untuk target
- Arcane = blueprint terbaik untuk `osc_auto/infra_control` + Rust docker control plane: reconcile-on-event, journal+rollback redeploy, image-update leases, agent dial-out tunnel, RBAC env-scoped. Catatan: JWT ML-DSA eksotis — target pakai Ed25519/ES256 + Envelope AES-256-GCM cukup; distroless runtime sudah sesuai standar ai-main.

---

## 4. Beszel — Kolektor Metrik Host/Container

### 4.1 Arsitektur hub–agent
- Hub: PocketBase embedded (SQLite + dbx, realtime SSE, cron, mail, OAuth/MFA) dengan manager composition (`AlertManager`, `UserManager`, `RecordManager`, `SystemManager`, `Heartbeat`); ed25519 keypair di `<dataDir>/id_ed25519`, pub key diserve `/api/beszel/getkey`.
- Agent: standalone Go binary; gopsutil v4 + reader Linux kustom (cgroup CPU/mem, netlink/ethtool/wifi, systemd, SMART, NVML/ROCm/Intel GPU, ZFS/Btrfs/mdraid/battery/lhm).
- **Protokol**: bukan gRPC — **WebSocket (preferred) + SSH (fallback)**, wire **CBOR** (`HubRequest{Action,Data,Id}` / `AgentResponse`); aksi: GetData, GetContainerLogs/Info, GetSmartData, GetSystemdInfo, GetZfsData, SyncNetworkMonitors, GetPackageUpdates, GetSystemdLogs.
  - WS: agent dial `/api/beszel/agent-connect` (header `X-Token` + `X-Beszel` semver) → hub **sign token bytes dengan ed25519** → agent verifikasi dengan pub key terkonfigurasi (`verifySignature`) → baru handler jalan; fingerprint agent = sha256(host id) pinned di tabel `fingerprints` (mismatch abort).
  - SSH fallback: **hub = SSH client, agent = SSH server** (gliderlabs/ssh :45876); hardening cipher chacha20-poly1305 + curve25519 + etm; PTY disabled; `InsecureIgnoreHostKey` di hub (trust di sisi agent keyed).
  - Connection manager agent: state machine Disconnected→WS|SSH, retry WS tiap 10 s, SSH server hanya hidup saat disconnected.

### 4.2 Metrik yang dikumpulkan (per 60 s, pull)
- CPU total + per-core + breakdown `[user,system,iowait,steal,idle,irq,softirq,nice]` (LXC-aware cgroup); load 1/5/15; uptime.
- Memory total/used/buff-cache/ZFS-ARC + swap (mode kalkulasi htop); disk usage root + `EXTRA_FILESYSTEMS` (cache anti spin-up disk tidur) + ZFS/Btrfs/mdraid/eMMC; disk IO read/write B/s via counter delta.
- Network send/recv B/s via **DeltaTracker** + whitelist/blacklist NIC; optional network monitors (ICMP ping + TLS cert, jadwal, `res_min/max/avg/loss`).
- Suhu (sensor whitelist, timeout), fan, battery, Wi-Fi RSSI, GPU per-device (temp/mem/usage/power).
- **Container stats: HTTP satu-shot ke docker socket** (`/containers/json` → `/containers/{id}/stats?stream=0&one-shot=1` dengan semaphore; **tanpa docker events streaming**); CPU% linux formula delta, Podman kalkulasi time-based; mem = usage − inactive_file; net per-interface delta capped 5 GB/s; deteksi Podman dari header `Server`; container log tail 200 (caps 1/5 MB); cek update image per-container dari registry.
- systemd services (total/failed + per-service cpu/mem/state), package updates (apt/dnf/apk), SMART devices.
- **Caching per-interval**: semua metrik delta menyimpan state terpisah keyed by `cacheTimeMs` agar request realtime tidak merusak window 60 s.

### 4.3 Model data & timeseries (PocketBase collections)
- Live/relasi: `systems` (status up/down/paused/pending, info JSON), `system_details` (static), `containers` (upsert per poll), `systemd_services` (FNV-stable hash id), `fingerprints`, `universal_tokens`, `smart_devices`, `zfs_pools`, `network_monitors(+_stats)`.
- Timeseries: `system_stats` & `container_stats` dengan kolom **`type` ∈ {1m, 10m, 20m, 120m, 480m}** + `stats` JSON + `created`; setiap poll 60 s insert 1m + upsert live dalam satu transaksi.
- **Downsampling ladder 1m→10m→20m→120m→480m** (cron */10, minimum sample guard: 10m≥9×1m, 20m≥2×10m, 120m≥6×20m, 480m≥4×120m; mean tanpa refleksi, peak fields di-preserve); **retensi berjenjang**: 1m→1 jam, 10m→12 jam, 20m→24 jam, 120m→7 hari, 480m→30 hari; `containers` >10 menit stale dihapus; alerts_history trim 200/user.
- **Alert**: record `alerts` (name select: Status/CPU/Memory/Disk/Temperature/Bandwidth/GPU/LoadAvg*/Battery/ContainerHealth/SystemdFailed/CPUIOWait/CPUSteal/NetworkMonitorLoss(+Cert), value threshold, `min` menit, `triggered`); evaluasi digabung ke poll 60 s (tanpa loop terpisah) — rata-rata N-menit dari `system_stats 1m` dengan syarat sampel ≥ min/1.2 (**histeresis**); Status alert pakai timer pending per-alert; notifikasi email + webhook **shoutrrr** (Telegram/Discord/Slack/ntfy/dll, admin-only URL) + quiet hours.
- Provisioning agent: UI (hub serve pub key + token per-system), mass-provision `config.yml` (`SyncSystems`), atau **universal token** (ephemeral 1 h / permanen) auto-create system.

### 4.4 Temuan kunci untuk target
- Blueprint langsung untuk `osc_auto/host_telemetry` + skema Prisma P3 telemetry (Hari 8) & Rust ingest (Hari 13/17): timeseries tier + retensi berjenjang, delta keyed per interval, alert hysteresis rata-rata-N, agent dial-out dengan ed25519 challenge (target: ganti SSH fallback dengan mTLS), one-shot docker stats polling.

---

## 5. Wazuh — FIM, SIEM Rules Engine & CVE (Arsitektur 5.x)

> **Penting**: tree ini adalah **Wazuh 5.1.0-alpha0** — arsitektur radikal baru. Tidak ada `analysisd`, tidak ada XML rules/decoders, tidak ada `vulnerability_detector` lama, tidak ada Filebeat. `ruleset/` hanya berisi MITRE ATT&CK JSON + SCA YAML.

### 5.1 Arsitektur manager
- **`src/engine`** (C++17, `wazuh-manager-analysisd`): pipeline `remoted → POST /events/enriched (UDS HTTP) → router/Orchestrator (queue + worker pool + hot-swap policy route) → dekoder hierarkis (depth-first, sibling-OR; YAML asset `<type>/<name>/<version>`, check/parse(logpar)/normalize) → enrichment (geo MaxMind, IOC RocksDB `iockvdb`, kvdb) → outputs → **wiconnector/indexer_connector** menulis `wazuh-events-v5-<category>` ke Wazuh Indexer (8 kategori integrasi: security, system-activity, cloud-services, applications, network-activity, access-management, other, unclassified).
- **Deteksi dipisah dua**: engine "has no rule asset" — mendekode & meng-index; **Sigma YAML detectors di dalam Wazuh Indexer** (fork OpenSearch Security Analytics, rules di index `wazuh-threatintel-rules`) menghasilkan **findings** `wazuh-findings-v5-<category>`. Migrasi 4x→5x: rule id numerik→UUID, level 0-16→severity keyword, `if_sid`/`frequency`/korrelasi → **tidak didukung 5.0**, local_rules.xml → content spaces Draft→Test→Custom tanpa restart.
- remoted: **HTTPS port 1517** (RESTinio, TLS 1.3 wajib fail-closed, JWT per-agent HS256 self-signed dengan `client.keys`) + legacy AES TCP/UDP 1514 untuk agen 4.x; wire format **Wazuh Event Protocol v1 (`x-wev1`)** — batch NDJSON `H <header JSON>` + `E <event>`; syslog 514 dihapus (rsyslog+agent); enrollment port 1515 + enrollment tokens + re-enroll verify.
- API Python aiohttp/connexion (port 55000, TLS, login attempt/block time/rate per-menit); cluster master/worker Python (sync integrity 8–9 s, `client.keys`/shared config dari master, DAPI forwarding).

### 5.2 FIM (syscheckd)
- **Dual-event architecture** (docs `fim/architecture.md`): event realtime **stateless** + state **stateful** via **Agent Sync Protocol** (`asp_*` di `shared_modules/sync_protocol`) → remoted `/stateful` → index `wazuh-events-v5-*` per WCS schema `fim-files.json` / `fim-registry-keys/values.json`.
- Realtime: inotify (`run_realtime.c`, watch table OSHash `dirtb`), Windows `ReadDirectoryChangesW`, fallback polling; **who-data**: auditd (instal rule `etc/audit_rules_wazuh.rules` + plugin socket, parse `audit_parse.c`), Windows SACL.
- Scan periodik default 43200 s (12 h) + integrity sync interval 24 h; diff terkompresi di `queue/diff` (dengan `<nodiff>`); checksum MD5+SHA1+SHA256 + size/perm/uid/gid/owner/mtime/attrs; registry HKLM x32/x64.
- **FIMDB** (`FIMDB` → DBSync → SQLite): `file_entry(path PK, checksum, device, inode, size, permissions, attributes, uid, gid, owner, hash_md5/sha1/sha256, mtime, version, sync)`, `registry_key`, `registry_data`.

### 5.3 Vulnerability detection / CVE
- **`src/wazuh_modules/vulnerability_scanner`** (C++): feed **CVE5 JSON dari CTI** di-download **content_manager** (interval default 60 m atau on-demand) → **RocksDB** `queue/vd/feed` (FlatBuffers: cve5, vulnerabilityCandidate/Description/Remediations, packageTranslation); readiness gate CTI+local maps; offset tracking; default ADP `nvd`; CVSS dari flatbuffer (score<0.01 dianggap unreliable); translasi nama paket via regex placeholder `$(PRODUCTn)/$(VENDORn)/$(VERSIONn)`.
- Matching: **Inventory Sync Server** menerima FullSync agent (syscollector packages/hotfixes/OS) → `ScanOrchestrator` Chain-of-Responsibility (`eventGetContext → eventGetCve → packageScanner/osScanner → eventDetailsBuilder → eventSendReport → resultIndexer`) + `vdQueryBuilder` + versionMatcher; hasil di-index ke Indexer + push ke engine ingest; rescan saat feed update (`vd_feed_offset` comparison).

### 5.4 Modul agent & RBAC
- syscollector (hardware/os/packages/processes/ports/network, dual-event + sync protocol), **SCA** (YAML policy CIS per-OS di `ruleset/sca/*` — `checks` dengan `compliance {pci_dss,hipaa,nist_800_53}` + `mitre`), active response (`block-ip-unix/windows`, `disable-account` via os_execd), cloud integrations (wodles AWS S3/CloudTrail/GuardDuty/SecurityHub, Azure, GCP, docker-listener) sebagai **modul agent**.
- RBAC (`framework/wazuh/rbac/orm.py`): users/roles/policies/resources `agent:id:*`, `agent:group:*`; aksi baru 5.x (`agent:uninstall`, `enrollment_token:*`, `agent:scan_vulnerability`); JWT + `run_as` auth-context; default users `wazuh`, `wazuh-internal-client`.

### 5.5 Temuan kunci untuk target
- Target omnisight (Wave 3, Hari 17) **tidak perlu mengklon arsitektur 5.x penuh**; ambil pola: (1) ingest FIM dual-event (stateless alert + stateful sync) dengan checksum multi-algo; (2) deteksi terpisah dari ingest (event store vs rule engine — target: Sigma-style di Rust, korrelasi `if_sid`/frequency ala 4.x tetap relevan sebagai referensi semantik); (3) VD = feed CVE (NVD/CTI) di RocksDB/di-target: tabel `vulnerability_candidate` + matching inventory packages + version matcher; (4) agent protocol NDJSON header/event + JWT per-agent; (5) komplians mapping compliance/mitre per check (SCA).

---

## 6. JumpServer — PAM Bastion Gateway & Session Audit

### 6.1 Arsitektur
- Django 5.2 monolith (Python ≥3.14), app terpisah: `assets`, `accounts` (PAM credential core v4), `perms`, `authentication` (ConnectionToken), `terminal` (Session/Command/Replay + component registry), `audits`, `acls`, `tickets`, `rbac`, `ops` (Celery+Ansible); UI eksternal (Lina console / Luna web terminal); **`jms` = launcher Python** (bukan Go); Go client SDK via submodule `pam-clients`; Celery queues `celery` + `ansible`; Redis (broker/cache/channels/lock, DB terpisah 3/4); Postgres.

### 6.2 Model aset & kredensial (PAM core)
- `Asset` (name, address, platform FK, zone FK, nodes M2M, gathered_info JSON) + subkelas per kategori (host/database/device/cloud/web/ds/custom); `Protocol` per-asset (ssh/sftp/rdp/telnet/vnc/winrm; DB: mysql/oracle/postgresql/sqlserver/db2/dameng/clickhouse/redis/mongodb; k8s/http) dengan `secret_types` per-protokol; `Node` = tree **materialized path** `key '1:1:1'` (descendant via key prefix); `Platform` (category, gateway_enabled, su_enabled, automation methods).
- **`Gateway` = proxy model atas Asset SSH internal** (`platform.name startswith 'Gateway'`) — tunnel ke target unreachable via sshtunnel/paramiko, dipakai baik interactive (koko/magnus) maupun Ansible (`ANSIBLE_EXECUTOR_GATEWAY_HOST`); `Zone` = CIDR assignment.
- **`Account`** (`accounts` app, per-asset): username, `secret_type` (password/ssh_key/ssh_certificate/token/access_key/api_key), privileged, `su_from` (su dari account lain), version + **riwayat secret** (django-simple-history pada `_secret`); template account (`follow_template`), personal credentials, virtual account (`@INPUT`/`@USER`).
- **Enkripsi at-rest 2 lapis**: (1) field `VaultSecretField`/EncryptMixin → **AES-GCM** (key = SECRET_KEY padded 32; opsi `SECURITY_DATA_CRYPTO_ALGO` aes_gcm/aes_ecb/**SM4**); (2) external vault backend (`VAULT_BACKEND`: local/openbao/hcp/aws/azure) — saat tersimpan ke vault, `_secret` diganti marker `# Secret-has-been-saved-to-vault #`; SSH CA signing via OpenBao (cert TTL 300 s).

### 6.3 Otorisasi koneksi (terpusat di ConnectionToken)
- `AssetPermission` (users/user_groups × assets/nodes × `accounts` **JSON list** dengan alias `@ALL/@INPUT/@USER` dan negasi `!name`; `protocols` JSON; `actions` **BitChoices**: connect=1, upload=2, download=3, copy=4, paste=5, delete=6, share=7; window `date_start–date_expired`; `valid()` queryset; node grant cascade ke descendant).
- **`ConnectionToken`** (value, user/asset/account/protocol, `input_secret` encrypted untuk @INPUT, `is_reusable`, expiry, `acl_context` JSON, type user/admin/applet): dibuat hanya setelah `_validate_perm()` (PermAssetDetailUtil + action `connect`) dan `_validate_acl()` → **`LoginAssetACL`** dapat menyuntik persyaratan bertahap: reason / **mfa** / **review** (ticket approval dengan reviewers) / face_verify / push_account; notifikasi login reminder.
- **Komponen tidak pernah akses DB**: koko (SSH/web terminal), lion (RDP/VNC guacamole), magnus (DB proxy :5525), razor/tinker/chen/kael, panda, video_worker meregistrasi via `Authorization: Bootstrap <BOOTSTRAP_TOKEN>` (dibatasi 300 s pertama uptime) → service account per-komponen → fetch token+**secret terdekripsi** via `ConnectionTokenSecretSerializer` dengan API signing **`X-JMS-SVC: Sign <ak_id>:<aes_ecb(ak.secret, timestamp)>`**; task WS via channels (`TerminalTaskWebsocket`, scope user terminal); `Endpoint` model untuk LB/port mapping (ssh 2222, rdp 3389, magnus 5525, vnc 15900).

### 6.4 Session & audit
- `Session` (`terminal_session`): UUID, denormalisasi user/asset/account string, protocol, `login_from` (ST/RT/WT/DT/VT), is_success/is_finished, has_replay/has_command, cmd_amount, replay_size; replay path `replay/<date>/<id>.cast.gz|.replay.mp4`; Redis tracking sesi aktif + lock; **session sharing** (SessionSharing/SessionJoinRecord).
- `Command` (`terminal_command`): input/output/timestamp per session; **storage pluggable** (`CommandStorageType`: null/server/**es**) + multi fan-out; `ReplayStorage`: server/s3/ceph/swift/oss/azure/obs/cos/sftp (**S3-compatible → RustFS expressible langsung**); FTPLog untuk file transfer; audits app: OperateLog, UserLoginLog (reason_code), PasswordChangeLog, ActivityLog, UserSession; enterprise Video Worker (OCR/transcode via guacenc/ffmpeg/paddleocr).
- **Command filter/CSA**: legacy `CommandFilter(±CommandFilterRule` regex/command, priority, **Action deny=0/confirm=2/allow=9 + reviewers**) → modern `CommandACL` (CommandGroup batch, command/regex) + ClipboardACL, DataMaskingRule, LoginACL (IP), ConnectMethodACL.

### 6.5 Auth & infra
- MFA 6 backends (otp/sms/email/radius/passkey-fido2/face) dengan level paksaan per-user; SSO: LDAP/CAS/OIDC(+OAuth2)/SAML/RADIUS/pubkey; password policy (expiry/min-length/history, hasher SM3 opsional); login limit + lockout + captcha; RBAC app (Role/RoleBinding builtin).
- Automasi via Celery queue `ansible` (ansible-runner batch 80 asset): gather_facts, ping, change_secret (ChangeSecretRecord menyimpan old/new terenkripsi + verification_status), push/verify/backup account; periodik via django-celery-beat (PeriodicTask).
- Deployment: Dockerfile multi-stage (uv, submodule check, bubblewrap sandbox Ansible, docker-cli), `config_example.yml` (SECRET_KEY, BOOTSTRAP_TOKEN, VAULT_*, SSH_CA_*, VIDEO_WORKER_*, storage replay split server/terminal).

### 6.6 Temuan kunci untuk target
- Blueprint utama `osc_auto/pam_bastion_gateway` (Hari 18) + Rust PAM vault (Hari 17) + Web SSH xterm.js (Hari 19): (1) ConnectionToken pattern = satu-satunya pintu otorisasi (ACL staging: mfa/review/ticket) — terapkan di Rust API dengan WS ticket; (2) secret fetch via service-account signed API, komponen tanpa akses DB; (3) enkripsi 2 lapis + vault marker → target pakai **Envelope AES-256-GCM** (ai-main standard, lebih kuat dari AES-ECB legacy JumpServer); (4) session/command/replay storage pluggable ke S3-compatible (RustFS); (5) command filter deny/confirm/allow dengan reviewer approval; (6) session replay `.cast.gz` (asciicast) + mp4.

---

## 7. Matriks Pola → Target Omnisight (Wave Mapping)

| Pola | Sumber | Target omnisight | Sesi |
| :--- | :--- | :--- | :--- |
| Compose parse/deploy via library (bukan CLI), env berlapis, validasi pra-deploy | arcane (`pkg/projects`), dockge | Rust docker control plane (`osc_rest` Wave 2) | Hari 13 |
| Stack/file atomik + drift watch + reconcile + journal rollback | arcane (tripwire, redeploy journal), dockge (anti-pattern non-atomik) | `osc_auto/infra_control` (Go) | Hari 14 |
| Image update digest polling + admission lease + auto-heal | arcane (`imageupdate`/`updater`) | Wave 2 Rust + agent | Hari 13–14 |
| Kolektor host/container: delta keyed per-interval, one-shot docker stats, GPU/sensor | beszel agent | `osc_auto/host_telemetry` (Go) | Hari 14 |
| Timeseries tier 1m→480m + retensi berjenjang + downsample min-sample | beszel (`records.go`) | Prisma P3 + Rust ingest | Hari 8, 13 |
| Alert histeresis rata-rata-N + status timer + notifikasi shoutrrr/quiet hours | beszel (`internal/alerts`) | Rust alert engine | Hari 13 |
| Agent dial-out (WS/gRPC tunnel + yamux), ed25519 challenge, fingerprint pinning, enrollment token | beszel/arcane | Pola auth agent osc_auto | Hari 14, 18 |
| FIM dual-event (inotify/auditd + stateful sync), FIMDB checksum | wazuh syscheckd | `flow_worker_agent` FIM + Rust SIEM ingest | Hari 17–18 |
| Sigma-style detection terpisah dari ingest; event→findings | wazuh 5.x engine+indexer | Rust rule engine Wave 3 | Hari 17 |
| VD: feed CVE (RocksDB/DB) + matching inventory + version matcher | wazuh vulnerability_scanner | Rust CVE ingest (Wave 3) | Hari 17 |
| SCA YAML policy + compliance/mitre mapping | wazuh ruleset/sca | Prisma P3 secops + SOC test | Hari 8, 20 |
| ConnectionToken + ACL staging (mfa/review/ticket) + signed service-account API | jumpserver | Rust PAM vault + WS ticket (`api-w3`) | Hari 17 |
| Bastion gateway (SSH tunnel), command filter deny/confirm/allow | jumpserver koko/magnus/cmd_filter | `osc_auto/pam_bastion_gateway` | Hari 18 |
| Web terminal xterm.js + session replay (asciicast/mp4) + storage S3 (RustFS) | jumpserver terminal/luna | `osc_site` SecOps Wave 3 | Hari 19 |
| Vault at-rest 2 lapis + external vault + SSH CA | jumpserver accounts/backends | Envelope AES-256-GCM di osc_rest | Hari 17 |

## 8. Risiko, Keamanan & Tindak Lanjut

- **Anti-pattern yang TIDAK diikutkan**: compose file write non-atomik & metadata filesystem-only (dockge); kredensial agent plaintext (dockge `agent` table); JWT secret = bcrypt-hash (dockge); AES-ECB / SM4-ECB legacy + key dari SECRET_KEY langsung (jumpserver — target wajib Envelope AES-256-GCM dengan KEK terpisah); `InsecureIgnoreHostKey` (beszel SSH fallback); 2FA via dependensi tak-deklarasi (dockge `notp`); korrelasi rule non-deterministik (wazuh 4.x-style frequency di 5.x dihapus — target definisikan semantik korrelasi eksplisit).
- **Risiko porting**: docker compose v5 Go lib tidak ada padanan Rust idiomatik (target: wrapper Docker Engine API + compose-go parse via sidecar Go agent `infra_control` — konsisten arsitektur Wave 2); wazuh 5.x masih alpha (jangan jadikan acuan API final, acuan semantik saja); jumpserver `accounts/clients` submodule kosong di shallow clone (tidak menghalangi audit model).
- **Rollback**: `.rea_docs/` tetap gitignored; cleanup penuh dijadwalkan Hari 21 (`SESI 5.1`); tidak ada perubahan kode pada repo sumber (0 dirty file).
