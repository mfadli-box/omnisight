# Technical Specification: Wave 2 — Agent Enrollment, Telemetry Ingest, Uptime & Infra Control Plane

- **Date**: 2026-11-12
- **Author**: ai-rest (Rust Backend & Security Engineer)
- **Target Project**: `osc_rest`
- **Shared Contract File**: `osc_docs/rest/contracts/w2.openapi.yaml`
- **Clean Architecture Layers Touched**: `domain` (ports/model tak berubah), `application` (alert evaluation, infra validators), `infrastructure` (store agents/telemetry/uptime/infra, HMAC-SHA256, LogBroker SSE, RustFS backup), `presentation` (handlers agents/uptime/infra, extractor HMAC agent, router)
- **Master Blueprint Ref**: `osc_docs/reengineering.md` (bab 3, 5.6–5.8; WBM Hari 13 / SESI 3.1)
- **Schema Ref**: `osc_docs/base/schema-p3.md` (tabel telemetry/uptime/docker/nginx/alerting)

---

## 1. Overview & Architectural Flow

Wave 2 menambahkan empat kelompok modul operasional pada `osc_rest`:

1. **Agent Enrollment & Auth** (bab 5.8) — admin menerbitkan *one-time enrollment token* terikat `company_id` (TTL 1–72 jam, disimpan SHA-256); agent `osc_auto` menukar token dengan `agent_id` (UUID ManagedNode dinamis pada `assets`), `hmac_secret` (256-bit, Envelope AES-256-GCM, ditampilkan sekali), dan `company_id`. Seluruh trafik agent berikutnya diautentikasi **HMAC-SHA256 per-request** dengan anti-replay window ±30 detik.
2. **High-Throughput Telemetry Ingest** — inventory hardware/software (+ laporan S.M.A.R.T.), batch metrik host (`system_metric_snapshots`), container (`container_metric_snapshots`), dan SNMP interface (`interface_metric_snapshots`) via multi-row INSERT ter-chunk (`QueryBuilder::push_values`, 250 baris/batch) + **evaluasi `AlertRule` histeresis** (pola Beszel) langsung di jalur ingest.
3. **Synthetic Uptime & Status Pages** (pola Uptime Kuma) — CRUD `uptime_monitors` polymorphic, heartbeat push dari agent dengan flag `important` (transisi UP↔DOWN), CRUD `status_pages` + join `status_page_monitors`, dan endpoint publik read-only per slug.
4. **Docker Stack & Nginx Control Plane** (pola Dockge/Arcane + Nginx UI) — CRUD `compose_stacks` & `nginx_virtual_hosts` dengan pipeline **validasi app-level → backup snapshot RustFS → dispatch antrean → eksekusi oleh agent `infra_control`** (API tidak pernah memanggil shell → zero command-injection surface), plus **live logs streaming via SSE**.

Alur layer (Clean Architecture, dependensi hanya ke dalam):

```
presentation/http/handlers/{agents,uptime,infra}
  → application/{alerts,infra_validate}            (pure logic, unit-testable)
  → infrastructure/store/{agents,telemetry,uptime,infra}  (sqlx, push_bind)
  → infrastructure/{hmac,logstream,storage}        (HMAC, SSE broker, RustFS)
```

Isolasi tenant (bab 5.6) ditegakkan di tiga titik:

- **Endpoint JWT**: `active_company_id` berasal dari sesi DB via `RequestContext` (`ctx.require_company()`), bukan dari body.
- **Endpoint agent**: `company_id` **selalu** dibaca dari baris `assets` milik agent (bukan dari body) — spoofing tenant via payload mustahil.
- **Endpoint publik**: hanya halaman `is_published`, tanpa config/push token; slug tervalidasi `[a-z0-9-]`.

### 1.1 Keputusan Desain Penting

| Keputusan | Alasan |
| :--- | :--- |
| Agent registry = baris `assets` (`is_dynamic=true`, `source='agent'`); `agent_id` = id asset | Skema P3 tidak memiliki tabel `agents` terpisah — ManagedNode adalah hub FK tunggal (bab 3 blueprint); enrollment mengikat agent langsung ke node |
| `hmac_secret` Envelope AES-256-GCM (base64) di `assets.metadata->{"agent"}` | Vault at-rest; plaintext hanya ada di respons enroll (sekali) dan memori proses |
| Dispatch = antrean `activity_logs` (`DOCKER_STACK_DISPATCH` / `NGINX_VHOST_DISPATCH` + `dispatch_ref`) | API tidak mengeksekusi shell; agent `infra_control` poll outbox (SESI 3.2), hasil ack memutakhirkan status stack/vhost |
| S.M.A.R.T. dipersist sebagai `hardware_inventory_snapshots.payload` `kind=smart` | Skema P3 tidak punya tabel SMART; `payload` JSONB adalah sink generik inventaris hardware |
| HMAC-SHA256 diimplementasikan manual di `infrastructure/hmac.rs` (RFC 2104) | Tanpa dependency baru; diverifikasi vektor RFC 4231 (test case 1, 2, 6) + perbandingan konstan-waktu |
| Compose/nginx hanya tervalidasi struktural app-level | Parse penuh compose-go/`nginx -t` tetap otoritatif di agent; gerbang API menangkap kesalahan umum & traversal sebelum backup/dispatch |

---

## 2. REST API & Real-Time (WS/SSE) Contract

Konvensi global: `X-Correlation-ID` (di-echo / di-generate UUIDv7), envelope sukses `{status:"success", data:{…}}`, envelope error `{status:"error", error:{code,message}}` (lihat `api-core-foundation.md`). Kontrak mesin: `osc_docs/rest/contracts/w2.openapi.yaml`.

### 2.1 Agent Enrollment

#### `POST /api/v1/agents/enrollment-tokens` — terbitkan one-time token (admin)
- **Auth & Permissions**: `Bearer JWT` + `active_company_id`; gate admin (`is_super_admin` ATAU role ber-nama `*admin*`)
- **Rate Limit**: 60 req/min per user (global limiter)
- **Headers**: `X-Correlation-ID`, `Authorization: Bearer …`

Request:
```json
{
  "node_type": "HOST",
  "ttl_hours": 24
}
```
- `node_type`: wajib, enum `HOST|NETWORK|VIRTUAL|CONTAINER|RACK_MOUNTED|SERVICE`
- `ttl_hours`: opsional (default 24), clamp 1–72

Response `201`:
```json
{
  "status": "success",
  "data": {
    "id": "uuid-token",
    "token": "hex-64-char (DITAMPILKAN SEKALI; DB hanya SHA-256)",
    "node_type": "HOST",
    "expires_at": "2026-11-13T08:00:00Z"
  }
}
```

#### `POST /api/v1/agents/enroll` — tukar token (publik, single-use atomik)
- **Auth & Permissions**: `Public` (token enrollment = kredensial)
- **Rate Limit**: 10 req/min per IP
- **Headers**: `X-Correlation-ID`

Request:
```json
{
  "enrollment_token": "hex-64-char",
  "hostname": "db-node-01",
  "mgmt_ip": "10.10.1.15",
  "asset_model_id": "uuid (wajib, milik company token)",
  "status_label_id": "uuid (wajib, milik company token)",
  "asset_tag": "opsional (unik per company; default AG-<uuid7>)",
  "agent_version": "0.1.0"
}
```

Response `201`:
```json
{
  "status": "success",
  "data": {
    "agent_id": "uuid (= id ManagedNode dinamis)",
    "company_id": "uuid",
    "hmac_secret": "hex-64-char (DITAMPILKAN SEKALI)",
    "node_type": "HOST",
    "asset_tag": "AG-018F3K…"
  }
}
```

Konsumsi token **atomik** — `UPDATE agent_enrollment_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING …` — dua agent paralel tidak bisa mengklaim token yang sama.

#### Autentikasi HMAC agent (semua endpoint `/agents/*/ingest`, `/agents/logs`)
Headers wajib:

| Header | Isi |
| :--- | :--- |
| `X-Agent-Id` | UUID agent |
| `X-Agent-Timestamp` | Unix epoch detik |
| `X-Agent-Signature` | hex HMAC-SHA256(secret, `{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}`) |

- Jendela anti-replay: `|now − ts| ≤ 30 s`.
- Signature mengikat body (`sha256_hex`) → tampering/partial-replay terdeteksi.
- Perbandingan signature konstan-waktu (`infrastructure/hmac.rs::constant_time_eq`).
- Secret dimuat dari vault (`assets.metadata`) dan didekripsi Envelope per request.

### 2.2 Telemetry Ingest

#### `POST /api/v1/agents/inventory/ingest`
- **Auth & Permissions**: `Agent HMAC`
- **Rate Limit**: 120 req/min per agent

Request (semua field opsional kecuali payload; `payload` JSONB bebas — disk, paket, service):
```json
{
  "cpu_model": "AMD EPYC 7B13", "cpu_cores": 16,
  "memory_total_bytes": 137438953472, "storage_total_bytes": 1920383410176,
  "os_name": "Ubuntu", "os_version": "24.04 LTS",
  "hostname": "db-node-01",
  "payload": { "packages": 1834, "disks": [ {"model": "Samsung PM9A3", "size": 3840755982336 } ] }
}
```
Response `202`: `{ "status": "accepted", "data": { "snapshot_id": "uuid" } }` — juga memutakhirkan `assets.hostname` (bila diisi) + `assets.last_seen_at`.

#### `POST /api/v1/agents/metrics/ingest`
- **Auth & Permissions**: `Agent HMAC`
- **Rate Limit**: 120 req/min per agent
- **Batas batch**: `containers ≤ 200`, `snmp_interfaces ≤ 500`, `smart ≤ 64` — lebih ditolak `400`

Request:
```json
{
  "host": {
    "recorded_at": "2026-11-12T08:00:00Z",
    "cpu_usage_pct": 87.5, "load1": 2.4, "load5": 2.1, "load15": 1.8,
    "mem_used_bytes": 64000000000, "mem_total_bytes": 137438953472,
    "disk_used_bytes": 900000000000, "disk_total_bytes": 1920383410176,
    "net_in_bps": 125000000, "net_out_bps": 98000000, "uptime_seconds": 864000
  },
  "containers": [
    {
      "host_id": "uuid docker_hosts", "container_ref": "a1b2c3d4e5f6", "container_name": "api",
      "recorded_at": "2026-11-12T08:00:00Z", "cpu_usage_pct": 12.5,
      "mem_used_bytes": 536870912, "mem_limit_bytes": 1073741824,
      "net_in_bps": 1000000, "net_out_bps": 800000,
      "block_read_bps": 20000, "block_write_bps": 15000, "pids": 42, "is_running": true
    }
  ],
  "smart": [
    { "device": "/dev/nvme0n1", "health": "PASSED", "temperature_c": 34,
      "reallocated_sectors": 0, "power_on_hours": 18250 }
  ],
  "snmp_interfaces": [
    { "interface_id": "uuid device_interfaces", "collected_at": "2026-11-12T08:00:00Z",
      "in_octets": 1844674407370955161, "out_octets": 922337203685477580,
      "in_rate_bps": 700000000, "out_rate_bps": 350000000,
      "in_errors": 0, "out_errors": 2, "in_discards": 0, "out_discards": 0 }
  ]
}
```
Response `202`:
```json
{
  "status": "accepted",
  "data": { "system_rows": 1, "container_rows": 1, "interface_rows": 1,
            "smart_reports": 1, "alert_events": 0 }
}
```

**Validasi tenant sebelum insert**: `host_id`/`agent_id` harus asset milik company; `containers[].host_id` harus `docker_hosts` milik company; `snmp_interfaces[].interface_id` harus `device_interfaces` milik company (query `id = ANY($2)`).

**Evaluasi `AlertRule`** (dijalankan pada setiap ingest):
1. Kandidat sampel dihitung app-level: `system.cpu_pct`, `system.mem_pct`, `system.disk_pct` (dari sampel host pertama), `container.cpu_pct` / `container.mem_pct` (per container).
2. Rule aktif (`alert_rules.is_active`, `company_id` aktif, `metric` dot-path hadir di batch) dimuat.
3. `target_filter` JSONB = deny-by-default; key yang didukung: `kind` (`system|container|uptime`), `host_id`, `container_ref`, `monitor_id`; array berisi UUID/ref; kosong/NULL = semua target.
4. Operator: `GT|GTE|LT|LTE|EQ|NEQ`.
5. **Histeresis**: FIRING hanya bila pelanggaran bertahan ≥ `duration_seconds` — dihitung `latest_breach_at − earliest_breach_at` dari timestamp sampel batch (anti wall-clock skew agent). State FIRING lama di-dedup; batch pulih (tanpa pelanggaran) mengubah FIRING terakhir menjadi RESOLVED. Event ditulis ke `alert_histories` (`fired_at`, `resolved_at`, snapshot `severity`, `value`, `message`).

#### `POST /api/v1/agents/uptime/ingest`
- **Auth & Permissions**: `Agent HMAC` (monitor wajib milik company agent)

Request:
```json
{ "monitor_id": "uuid", "status": "DOWN", "ping_ms": null,
  "msg": "connect timeout", "recorded_at": "2026-11-12T08:00:05Z" }
```
Response `202`: `{ "status": "accepted", "data": { "heartbeat_id": "uuid", "alert_events": 1 } }`

- `important` = true saat transisi status dari heartbeat sebelumnya (pola partial index Uptime Kuma).
- Rule `uptime.down` dievaluasi: value `1.0` saat DOWN / `0.0` saat UP.

#### `POST /api/v1/agents/logs` (live logs push)
- **Auth & Permissions**: `Agent HMAC`; referensi (`docker_stack`/`nginx_vhost`) wajib milik company

Request:
```json
{ "scope": "docker_stack", "reference": "uuid stack", "source": "compose",
  "level": "INFO", "lines": ["Pulling api …", "Container api  Healthy"] }
```
Response `202`: `{ "status": "accepted", "data": { "published": 2 } }` — baris ≤ 100, masing-masing dipotong 2000 karakter; level `DEBUG|INFO|WARN|ERROR`.

### 2.3 Monitors & Status Pages

#### `GET|POST /api/v1/monitors`, `GET|PUT|DELETE /api/v1/monitors/{id}` (JWT)
- **Auth & Permissions**: `Bearer JWT` + `active_company_id` (RBAC granular mengikuti menu privilege Uptime)
- Validasi: `name` 1–150; `interval_seconds` clamp 10–86.400 (default 60); `retries` clamp 0–10 (default 1); target per tipe:
  - `HTTP|HTTPS|KEYWORD`: URL http(s) valid, **tanpa userinfo** (anti-SSRF ringan; pemantauan intranet adalah tujuan produk — range privat diizinkan), `KEYWORD` wajib `config.keyword`;
  - `TCP`: `host:port`; `DNS`: hostname polos; `ICMP|PUSH`: tanpa scheme;
  - `asset_id` (opsional) wajib milik company (anti IDOR).
- Tipe `PUSH` mengembalikan `push_token` plaintext **sekali** (disimpan SHA-256, unik global).
- `PUT` tidak merotasi push token; `DELETE` = soft delete (heartbeat append-only dipertahankan).

#### `GET|POST /api/v1/status-pages`, `GET|PUT|DELETE /api/v1/status-pages/{id}` (JWT)
- `slug`: 1–100 karakter `[a-z0-9-]` (anti path traversal; UNIQUE per company)
- `monitor_ids` (create/put) → replace m2m `status_page_monitors` (sort order = index array); semua monitor wajib milik company.

#### `GET /api/v1/status-pages/{slug}` — PUBLIK
- **Auth & Permissions**: `Public` (hanya `is_published`; `deleted_at IS NULL`)
- Response: meta halaman + daftar monitor: `{id, name, type, status, ping_ms, message, uptime_pct_24h}` — **tanpa** `config`, `push_token_hash`, atau data tenant lain.
- Catatan: slug unik per company — bila dua tenant memakai slug sama, entri ter-early (`ORDER BY created_at LIMIT 1`) yang dilayani; disarankan slug unik global (dokumentasikan pada UI SESI 3.3).

### 2.4 Docker Stack Control Plane

#### `GET /api/v1/docker/hosts` — referensi host (JWT)
#### `GET|POST /api/v1/docker/stacks`, `GET|PUT|DELETE /api/v1/docker/stacks/{id}` (JWT)
- `POST /api/v1/docker/stacks` request:
```json
{
  "docker_host_id": "uuid (wajib milik company)",
  "name": "monitoring",                       // [a-zA-Z0-9_-], 1–150
  "working_dir": "/opt/stacks/monitoring",    // absolut, anti '..' '~' '\'
  "compose_content": "services:\n  web:\n    image: grafana/grafana:11\n",
  "env": "GF_SECURITY_ADMIN_PASSWORD=…"
}
```
- **Validasi compose** (`application/infra_validate.rs`): ≤ 256 KB; top-level key allowlist (`services|networks|volumes|configs|secrets|name|version`) — `include` ditolak; `services:` wajib; tiap service wajib `image:`/`build:`; indentasi tab ditolak.
- `env` dienkripsi **Envelope AES-256-GCM** (`env_encrypted`) — ciphertext tidak pernah diekspos respons apa pun; update mendukung hapus (`""`) / ganti.
- `PUT` + dispatch `up|restart` **otomatis backup snapshot compose lama** ke RustFS `config-backups/{company}/compose/{stack}/{ts}.yaml` + registry `file_assets` (`CONFIG_BACKUP`, sha256) + pointer `backup_object_key`.
- Respons get memuat `compose_content` (preview editor) tanpa env.

#### `POST /api/v1/docker/stacks/{id}/dispatch` (JWT) → `202 QUEUED`
```json
{ "command": "up" }   // up | down | pull | restart
```
```json
{ "status": "queued", "data": { "dispatch_ref": "uuid", "command": "up", "stack_id": "uuid" } }
```
- Backup snapshot (up/restart) → antrean ditulis ke `activity_logs` (`DOCKER_STACK_DISPATCH`, `detail.command`, `detail.dispatch_ref`) → 202. Agent `infra_control` mengeksekusi dan melaporkan hasil (SESI 3.2); `last_deployed_at` diperbarui saat dispatch `up`.

### 2.5 Nginx Reverse Proxy Control Plane

#### `GET /api/v1/nginx/nodes` — referensi node (JWT)
#### `GET|POST /api/v1/nginx/vhosts`, `GET|PUT|DELETE /api/v1/nginx/vhosts/{id}` (JWT)
- `POST` request:
```json
{
  "nginx_node_id": "uuid (wajib milik company)",
  "server_name": "app.example.com",
  "listen_port": 80,
  "config_content": "server {\n  listen 80;\n  server_name app.example.com;\n  location / {\n    proxy_pass http://app;\n  }\n}\n",
  "ssl_cert_path": "/etc/nginx/ssl/app.crt",
  "ssl_key_path": "/etc/nginx/ssl/app.key"
}
```
- **Validasi config** (`application/infra_validate.rs`): ≤ 128 KB; brace seimbang (di luar komentar & string); blok `server {` wajib; `include` anti path traversal & harus absolut/wildcard.
- `UNIQUE (nginx_node_id, server_name, listen_port)`; update mengembalikan status ke `DRAFT`.

#### `POST /api/v1/nginx/vhosts/{id}/dispatch` (JWT) → `202 QUEUED`
- Pipeline: re-validasi config tersimpan → backup `.conf` lama ke RustFS `config-backups/{company}/nginx/{vhost}/{ts}.conf` (+ `file_assets`) → status `TESTING` (`validated_at`) → antrean `NGINX_VHOST_DISPATCH` (`detail.command = "test_reload"`, `dispatch_ref`) → agent menjalankan `nginx -t && reload` lalu ack: `APPLIED` (atau `FAILED` + `last_error`) — pola validasi→history→atomic→rollback Nginx UI.

### 2.6 Live Logs — SSE

#### `GET /api/v1/infra/logs/stream?scope={docker_stack|nginx_vhost}&reference={uuid}` (JWT)
- **Auth & Permissions**: `Bearer JWT` + `active_company_id`
- **Content-Type**: `text/event-stream`; keep-alive komentar `: keep-alive` tiap 15 s
- Query opsional: tanpa parameter = semua event company; `scope` dan/atau `reference` mempersempit.

Stream event (`event: log`):
```
event: log
data: {"ts":"2026-11-12T08:00:01Z","scope":"docker_stack","reference":"…","company_id":"…","level":"INFO","source":"compose","message":"Container api  Healthy"}

event: lagged
data: {"dropped":true}
```
- Sumber event: `POST /api/v1/agents/logs` (HMAC) → `LogBroker` (broadcast in-process, kapasitas 1024).
- Filter server-side per `company_id` (event tenant lain tidak pernah sampai ke subscriber) + scope/reference opsional.
- Subscriber lambat menerima event `lagged` (bukan stream putus); koneksi tutup bersih saat graceful shutdown.

#### Error Responses (berlaku semua endpoint W2)

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | compose/nginx invalid, path traversal, batch melebihi batas, target monitor tidak valid, slug/server_name tidak valid, HMAC body malformed |
| `401` | `UNAUTHORIZED` | Token enrollment terpakai/kedaluwarsa, HMAC signature salah/kedaluwarsa (±30 s), agent tidak terdaftar, JWT tidak valid |
| `403` | `FORBIDDEN` | Endpoint admin diakses non-admin, tanpa `active_company_id` |
| `404` | `NOT_FOUND` | Monitor/stack/vhost/status page (atau slug tidak ter-publish) |
| `409` | `CONFLICT` | Pelanggaran UNIQUE (name stack, asset_tag, slug, dsb.) |
| `413` | `PAYLOAD_TOO_LARGE` | Body ingest > 4 MB (agent) / melebihi batas router |
| `429` | `RATE_LIMITED` | Rate limit terlampaui |
| `500` | `INTERNAL_ERROR` | Kegagalan RustFS backup/db (detail di-redaksi dari klien) |

---

## 3. Storage (RustFS), Cryptography & Database Interaction

### 3.1 PostgreSQL (selaras migrasi `osc_base`)

| Tabel | Operasi W2 | Isolasi |
| :--- | :--- | :--- |
| `agent_enrollment_tokens` | INSERT (hash+TTL), UPDATE konsumsi atomik (`used_at IS NULL AND expires_at > now()`) | `company_id` terikat saat create |
| `assets` | INSERT dinamis (enroll), UPDATE `last_seen_at`/`hostname`, SELECT metadata vault | `company_id = $1` leading |
| `hardware_inventory_snapshots` | INSERT inventory + SMART (`payload` `kind=smart`) | `company_id`, `asset_id` tervalidasi |
| `system_metric_snapshots` | Batch INSERT chunk 250 (16 kolom, termasuk `agent_id`, tier `TIER_1M`) | host tervalidasi per tenant dulu |
| `container_metric_snapshots` | Batch INSERT; host = `docker_hosts` milik tenant | validasi `id = ANY($2)` |
| `interface_metric_snapshots` | Batch INSERT (kolom camelCase `"inOctets"/"outOctets"` dikutip) | interface milik tenant |
| `alert_rules` / `alert_histories` | SELECT aktif, INSERT FIRING/RESOLVED | `company_id`; dedup per `(rule, target_ref)` |
| `uptime_monitors` / `uptime_heartbeats` | CRUD + soft delete; INSERT heartbeat + transisi `important` | `company_id` leading |
| `status_pages` / `status_page_monitors` | CRUD + replace m2m dalam transaksi | `company_id`; publik hanya `is_published` |
| `docker_hosts` / `compose_stacks` / `nginx_nodes` / `nginx_virtual_hosts` | CRUD + status pipeline + pointer backup | FK host/node wajib milik tenant |
| `activity_logs` | Antrean dispatch + audit enrollment | append-only |
| `file_assets` | Registry backup (bucket `UNIQUE (bucket, object_key)`) | `company_id` |

Semua query runtime parameterized (`bind` / `QueryBuilder::push_bind`) — zero string interpolation dari input klien; nama tabel hanya dari enum `RefTable` (type-safe).

### 3.2 RustFS (bucket `osc-rustfs` sesuai config)

- Key pattern backup: `config-backups/{company_id}/compose/{stack_id}/{ts_ms}.yaml` dan `config-backups/{company_id}/nginx/{vhost_id}/{ts_ms}.conf` — company_id sebagai prefix (isolasian & lifecycle per tenant).
- Backup dijalankan **sebelum** overwrite/dispatch destruktif; registry `file_assets` kategori `CONFIG_BACKUP` + `sha256` integritas.
- Kegagalan RustFS = request gagal (`500` generik, detail ke log) — backup tidak pernah dilewati diam-diam.

### 3.3 Cryptography

- **Envelope AES-256-GCM** (KEK dari `MASTER_KEY_HEX`): `hmac_secret` agent (base64 di `assets.metadata`), `compose_stacks.env_encrypted`. Nonce 96-bit acak per enkripsi; dekripsi per-request untuk verifikasi HMAC.
- **SHA-256**: hash token enrollment, hash push token monitor, hash body untuk kanonis signature HMAC, checksum backup.
- **HMAC-SHA256** (RFC 2104): implementasi manual `infrastructure/hmac.rs`, tervalidasi vektor RFC 4231.
- Tidak ada secret di log — semua error infrastruktur melewati `logging::redact()`.

---

## 4. Security Controls & Threat Mitigation

| Ancaman | Mitigasi |
| :--- | :--- |
| Agent spoofing / replay | Enrollment one-time atomik + TTL; HMAC per-request mengikat method+path+body hash+timestamp; window replay ±30 s; perbandingan konstan-waktu |
| Kebocoran lintas tenant | `company_id` agent dari DB (bukan body); semua query leading `company_id`; validasi FK (`RefTable::ref_in_company`) sebelum insert; SSE difilter per tenant server-side |
| Path traversal (stack/vhost) | `working_dir` absolut tanpa `..`, `~`, `\`, kontrol char; `include` nginx ditolak bila traversal; slug `[a-z0-9-]`; object key backup di-generate server (UUID/id + timestamp) |
| Command injection | API **tidak pernah** mengeksekusi shell — dispatch hanya antrean terstruktur (`command` enum allowlist `up|down|pull|restart`, `test_reload`); eksekusi oleh agent dengan validasinya sendiri |
| Compose/config malform | Gerbang struktural app-level (allowlist top-level key, service tanpa source, brace seimbang, tab indentasi) sebelum backup/dispatch; parse penuh tetap di agent |
| Brute-force HMAC/timestamp | Timestamp di luar ±30 s ditolak sebelum query DB; secret 256-bit acak; kegagalan auth tidak membocorkan perbedaan "agent tidak ada" vs "signature salah" (pesan generik) |
| Secret at-rest | `hmac_secret` & `env` compose Envelope AES-256-GCM; token enrollment/push monitor disimpan sebagai SHA-256; plaintext hanya di respons pembuatan (sekali) |
| Payload bomb ingest | Default body limit agent 4 MB + batas baris batch (200 container / 500 interface / 64 SMART / 100 baris log × 2000 char) + compose 256 KB / nginx 128 KB |
| Info leak | `push_token_hash`, `env_encrypted`, ciphertext, metadata vault tidak pernah diekspos; status page publik ter-proyeksi; error internal → `500` generik via `AppError::internal()` |
| Correlation & audit | `X-Correlation-ID` di-echo semua endpoint; enrollment, dispatch, create stack/vhost tercatat `activity_logs` (append-only) |

---

## 5. File & Modul Terdampak

| Path | Isi |
| :--- | :--- |
| `osc_rest/src/application/alerts.rs` | Evaluasi rule (operator, filter deny-by-default, histeresis, pesan) + test |
| `osc_rest/src/application/infra_validate.rs` | Validator compose/nginx/working_dir + test |
| `osc_rest/src/infrastructure/hmac.rs` | HMAC-SHA256 RFC 2104 + konstanta-waktu + kanonis signature + test vektor RFC 4231 |
| `osc_rest/src/infrastructure/logstream.rs` | `LogBroker` broadcast (SSE sumber) |
| `osc_rest/src/infrastructure/store/{agents,telemetry,uptime,infra}.rs` | Repository Wave 2 |
| `osc_rest/src/presentation/http/agent_auth.rs` | Extractor `AgentRequest<T>` (HMAC + body hash + vault decrypt) |
| `osc_rest/src/presentation/http/handlers/{agents,uptime,infra}.rs` | Handler REST/SSE Wave 2 |
| `osc_rest/src/presentation/http/router.rs` | Wiring route (publik / agent / terproteksi) |
| `osc_rest/src/presentation/http/{state,mod}.rs`, `main.rs` | `logs: Arc<LogBroker>` wiring |

Verifikasi (lokal, `osc_rest/`):

```bash
cargo check                 # OK
cargo clippy -- -D warnings # OK (0 warning)
cargo test                  # 61 passed (termasuk 14 test baru Wave 2)
```
