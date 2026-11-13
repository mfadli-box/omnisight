# Technical Specification: Wave 3 — SecOps (SIEM/FIM/CVE) & PAM Bastion (Vault, Mandatory MFA, Session Recording)

- **Date**: 2026-11-13
- **Author**: ai-rest (Rust Backend & Security Engineer)
- **Target Project**: `osc_rest`
- **Shared Contract File**: `osc_docs/rest/contracts/w3.openapi.yaml`
- **Clean Architecture Layers Touched**: `domain` (error `PamMfaRequired`/`PamStepUpRequired`/`PolicyDenied`), `application` (`pam`, `secops`, `notifications` — pure logic), `infrastructure` (`store/pam`, `store/secops`, `store/notifications`, `cidr`, `storage` bucket-param, `config`), `presentation` (`handlers/pam`, `handlers/secops`, `handlers/notifications`, extractor `AgentUpload`, router)
- **Master Blueprint Ref**: `osc_docs/reengineering.md` (bab 3, 5.3, 5.6, 5.8; WBM Hari 16 / SESI 4.1)
- **Schema Ref**: `osc_docs/base/schema-p3.md` (§3.13–3.19 SecOps & PAM, `notification_channels` P1)

---

## 1. Overview & Architectural Flow

Wave 3 menambahkan dua domain keamanan pada `osc_rest`:

1. **Security Telemetry Ingest** (pola Wazuh 5.x) — `POST /api/v1/agents/security/ingest` (HMAC agent) menerima empat kelas batch:
   - **FIM dual-event** (`fim_baseline_events`): REALTIME (inotify) & SCHEDULED (checksum), checksum SHA-256 64-hex, atribut lama/baru JSONB.
   - **Log anomali keamanan** (`security_alert_events`): detector (Sigma/Syscheck) terpisah dari event store, mapping MITRE ATT&CK, severity, source IP.
   - **Matching paket terinstal → CVE** (`vulnerability_findings`): upsert dedupe `UNIQUE (asset_id, cve_id)` — `last_detected_at` maju, `first_detected_at` dipertahankan.
   - **Compliance/SCA** (`compliance_check_results`): upsert dedupe per `(asset_id, benchmark, check_id, checked_at)`.
2. **PAM Bastion & Vault** (pola JumpServer) — CRUD vault akun (secret Envelope AES-256-GCM), `POST /api/v1/pam/sessions/authorize` dengan **mandatory MFA + step-up 15 menit**, penerbitan **ephemeral WS ticket** (TTL ≤ 120 s, sekali pakai, hash SHA-256), redeem oleh `pam_bastion_gateway`, dan **immutable session recording** ke bucket privat RustFS `RUSTFS_BUCKET_PAM`.
3. **Notification Channel & Retention** — CRUD `/api/v1/notifications/channels` (config terenkripsi, secret di-mask) untuk dispatcher `flow_worker_agent`, plus endpoint internal purge retensi ber-HMAC dengan allowlist env (deny-by-default).

Alur layer (Clean Architecture, dependensi hanya ke dalam):

```
presentation/http/handlers/{secops,pam,notifications}
  → application/{secops,pam,notifications}         (pure logic: validasi, step-up, masking)
  → infrastructure/store/{secops,pam,notifications} (sqlx, push_bind, enum CAST)
  → infrastructure/{hmac,cidr,storage}              (HMAC, CIDR ACL, RustFS multi-bucket)
```

Isolasi tenant `active_company_id` (bab 5.6) ditegakkan di empat titik:

- **Endpoint JWT**: `active_company_id` dari sesi DB via `RequestContext` (`ctx.require_company()`), bukan body.
- **Endpoint agent (HMAC)**: `company_id` dari baris `assets` agent; `asset_id` pada setiap event dipaksa **identik dengan agent pelapor** (anti-spoof lintas host).
- **Vault**: setiap query akun/sesi/policy membawa `company_id` leading (anti IDOR).
- **RustFS**: bucket rekaman terpisah + object key `pam/{company_id}/{session_id}/{uuidv7}.ext` (tidak bisa path-traversal).

### 1.1 Keputusan Desain Penting

| Keputusan | Alasan |
| :--- | :--- |
| Mandatory MFA PAM tidak dikenakan pengecualian super admin | bab 5.3: "PAM tidak menerima login tanpa MFA sama sekali" — ditolak `403 MFA_REQUIRED_FOR_PAM` + `pam_session_logs` DENIED |
| Step-up derivasi dari `mfa_last_verified_step` (bukan kolom timestamp) | Skema P1 hanya menyimpan step TOTP terakhir; usia = `(now_step − last_step) × 30 s` — tanpa migrasi tambahan; login backup-code (step 0) otomatis "jauh di luar window" |
| Ticket satu pakai + TTL 120 s (default, clamp 30–600 s), DB hanya SHA-256 | Pola token enrollment W2; redeem atomik `UPDATE ... WHERE status='AUTHORIZED'` → balapan dua kali redeem mengembalikan 409 |
| Secret didekripsi hanya pada redeem, bukan authorize | Vault 2 lapis: kredensial target hanya mengalir ke `pam_bastion_gateway` (jalur internal) setelah sesi berstatus AUTHORIZED; API/UI tidak pernah melihat secret |
| Rekaman: body biner raw (bukan multipart) + HMAC | Signature HMAC mengikat `sha256(body)`; magic bytes gzip `1F 8B` / MP4 `ftyp` divalidasi server-side; DB hanya pointer (`recording_object_key`) + registry `file_assets` kategori `PAM_RECORDING` |
| Purge retensi deny-by-default via env `RETENTION_PURGE_AGENT_IDS` | Endpoint internal untuk `flow_worker_agent`; agent tidak terdaftar → 403 tanpa fallback |
| Notification `config` JSONB menyimpan `{"enc": base64}` | Envelope AES-256-GCM atas seluruh config (SMTP password, bot token, webhook secret); API hanya mengembalikan ringkasan `has_*` boolean |
| `approval_required`/`ticket_required` → 403 `PAM_POLICY_DENIED` | ACL staging JumpServer workflow approval merupakan scope W4 — deny-by-default aman; alasan tercatat di audit |

---

## 2. REST API Contract

Autentikasi:
- **JWT**: `Authorization: Bearer <access_token>` + `active_company_id` dari sesi (switch-company). Gate endpoint admin tidak berlaku di W3 — CRUD vault mengikuti privilege menu `can_create/can_update/can_delete` di level UI; server memvalidasi konteks tenant + super admin pada endpoint sensitif via pola `require_admin` (W2).
- **Agent HMAC** (bab 5.8): header `X-Agent-Id`, `X-Agent-Timestamp` (±30 s), `X-Agent-Signature` = hex HMAC-SHA256 atas `{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}`.

Semua endpoint meng-echo `X-Correlation-ID`. Envelope error: `{status:"error", error:{code,message}}`.

### `POST /api/v1/agents/security/ingest`
- **Auth & Permissions**: Agent HMAC (`X-Agent-*`).
- **Rate Limit**: mengikuti kapasitas ingest; batas batch per request.
- **Headers**: `X-Correlation-ID`, `X-Agent-Id`, `X-Agent-Timestamp`, `X-Agent-Signature`.

#### Request Schema
```json
{
  "fim_events": [{
    "asset_id": "uuid (opsional; wajib = agent pelapor bila diisi)",
    "path": "string, 1–1000 char (wajib)",
    "event_type": "CREATED|MODIFIED|DELETED|ATTRIBUTE_CHANGED",
    "detection_source": "REALTIME|SCHEDULED (default SCHEDULED)",
    "baseline_version": "int >= 1 (default 1)",
    "old_checksum": "sha256 hex 64 (opsional)",
    "new_checksum": "sha256 hex 64 (opsional)",
    "old_attrs": "json (mode/uid/gid/mtime/size)",
    "new_attrs": "json",
    "size_bytes": "int (opsional)",
    "detected_at": "ISO-8601 (default now())"
  }],
  "security_alerts": [{
    "asset_id": "uuid (opsional; wajib = agent pelapor)",
    "rule_name": "string 1–200 (wajib)",
    "category": "string ≤100 (authentication|malware|web_attack|...)",
    "severity": "LOW|MEDIUM|HIGH|CRITICAL (default MEDIUM)",
    "mitre_tactic": "string ≤100",
    "mitre_technique": "string ≤100",
    "source_ip": "IPv4/IPv6 (opsional)",
    "payload": "json (decoded fields)",
    "detected_at": "ISO-8601"
  }],
  "vulnerabilities": [{
    "asset_id": "uuid (opsional; wajib = agent pelapor)",
    "cve_id": "CVE-YYYY-NNNN..NNNNNNN (≤20 char, wajib)",
    "title": "string 1–300 (wajib)",
    "severity": "LOW|MEDIUM|HIGH|CRITICAL",
    "cvss_score": "0.0–10.0",
    "version_installed": "string ≤150",
    "version_fixed": "string ≤150",
    "source_feed": "string ≤100",
    "detected_at": "ISO-8601"
  }],
  "compliance_results": [{
    "asset_id": "uuid (opsional; wajib = agent pelapor)",
    "benchmark": "string 1–100, e.g. 'CIS Ubuntu 22.04 LTS L1' (wajib)",
    "check_id": "string 1–50 (wajib)",
    "title": "string 1–300 (wajib)",
    "status": "PASS|FAIL|ERROR|SKIPPED (default FAIL)",
    "severity": "LOW|MEDIUM|HIGH|CRITICAL",
    "evidence": "json (expected vs actual)",
    "checked_at": "ISO-8601"
  }]
}
```
Batas batch: `fim_events ≤ 500`, `security_alerts ≤ 200`, `vulnerabilities ≤ 500`, `compliance_results ≤ 500`. Insert multi-row ter-chunk 250 baris (`QueryBuilder` push_bind + `CAST($n AS enum)`).

#### Response Schema
```json
{
  "status": "accepted",
  "data": {
    "fim_events": 12, "security_alerts": 3,
    "vulnerabilities": 7, "compliance_results": 41
  }
}
```
HTTP `202 Accepted`.

#### Error Responses

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Enum tidak valid, checksum bukan hex-64, cve_id malformed, cvss di luar 0–10, batch > batas, `asset_id` ≠ agent pelapor |
| `401` | `UNAUTHORIZED` | Header HMAC hilang/salah, timestamp di luar ±30 s, agent tidak terdaftar |

### `GET /api/v1/secops/overview`
- **Auth & Permissions**: Bearer JWT + company aktif.

#### Response Schema
```json
{
  "status": "success",
  "data": {
    "counts": { "fim_unresolved": 0, "alerts_unacknowledged": 2, "vulnerabilities_open": 5 },
    "fim_recent": [ { "id": "...", "path": "/etc/passwd", "event_type": "MODIFIED", "...": "..." } ]
  }
}
```

### `POST /api/v1/pam/accounts`
- **Auth & Permissions**: Bearer JWT + company aktif.
- **Headers**: `X-Correlation-ID`.

#### Request Schema
```json
{
  "asset_id": "uuid (wajib; milik company aktif)",
  "policy_id": "uuid (opsional; NULL = akun tidak dapat diakses)",
  "label": "string 1–150 (wajib)",
  "account_type": "SSH_PASSWORD|SSH_KEY|DATABASE|HTTP_ENDPOINT",
  "username": "string 1–150 (wajib)",
  "secret": "string 1–32768 byte (password / private key plaintext — dienkripsi server-side)",
  "port": "int 1–65535 (default 22)"
}
```

#### Response Schema
```json
{
  "status": "success",
  "data": { "id": "...", "label": "...", "account_type": "SSH_PASSWORD", "...": "..." }
}
```
HTTP `201 Created`. Respons **tidak pernah** memuat `secret` maupun ciphertext.

#### Error Responses

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Field wajib kosong, enum salah, secret > 32 KB, `asset_id`/`policy_id` milik tenant lain |
| `409` | `CONFLICT` | Pelanggaran `UNIQUE (asset_id, username)` |

### `GET|PUT|DELETE /api/v1/pam/accounts/{id}`
- **Auth & Permissions**: Bearer JWT + company aktif (anti IDOR).
- `PUT` menerima patch: `label`, `policy_id` (`null` = lepas policy), `port`, `is_active`, `secret` (rotasi → re-encrypt Envelope).
- `DELETE` = soft delete (`deleted_at`, `is_active=false`) — audit vault tetap utuh.

### `POST /api/v1/pam/sessions/authorize`
- **Auth & Permissions**: Bearer JWT + company aktif. **Endpoint inilah penegak mandatory MFA (bab 5.3).**
- **Headers**: `X-Correlation-ID`; `X-Forwarded-For` (hop pertama = IP klien, dipakai CIDR ACL).

#### Request Schema
```json
{
  "account_id": "uuid (wajib; milik company aktif)",
  "otp": "string (wajib bila step-up; opsional sebaliknya)",
  "reason": "string ≤300 (audit)",
  "duration_minutes": "int (di-clamp ke policy.max_session_minutes, cap absolut 480)"
}
```

#### Alur otorisasi (urutan eksekusi server)

| # | Pemeriksaan | Kegagalan |
| :--- | :--- | :--- |
| 1 | Akun vault ada & aktif pada `active_company_id` | `404 NOT_FOUND` / `400` |
| 2 | `policy_id` terisi & policy aktif | `403 PAM_POLICY_DENIED` + sesi `DENIED` (`PAM_ACCOUNT_NO_POLICY` / `PAM_POLICY_INACTIVE`) |
| 3 | **`user.mfa_enabled == true`** (tanpa kecuali) | **`403 MFA_REQUIRED_FOR_PAM`** + sesi `DENIED` (`MFA_REQUIRED_FOR_PAM`) |
| 4 | IP sumber ∈ `allowed_source_cidrs` (kosong = semua) | `403 PAM_POLICY_DENIED` (`PAM_POLICY_SOURCE_CIDR`) |
| 5 | `approval_required` / `ticket_required` | `403 PAM_POLICY_DENIED` (workflow W4) |
| 6 | **Step-up**: `usia = (now_step − mfa_last_verified_step) × 30 s`; `usia > step_up_window_minutes×60` → wajib `otp` | `otp` kosong → `403 PAM_STEP_UP_REQUIRED` (klien mengulang authorize dengan OTP) |
| 7 | OTP diverifikasi (±1 step, anti-replay, rate-limit 5 gagal/15 mnt) | `401 UNAUTHORIZED` + sesi `DENIED` (`PAM_OTP_INVALID`) |
| 8 | Terbitkan sesi `AUTHORIZED` + ephemeral ticket | — |

#### Response Schema (sukses)
```json
{
  "status": "success",
  "data": {
    "session_id": "uuid",
    "gateway": "pam_bastion_gateway",
    "ticket": "hex-256-bit (SEKALI tampil)",
    "ticket_ttl_seconds": 120,
    "duration_minutes": 120,
    "account": { "id": "...", "label": "...", "username": "...", "account_type": "SSH_PASSWORD", "asset_id": "...", "port": 22 },
    "policy": { "id": "...", "name": "...", "mfa_required": true, "command_filter": { "deny": [], "confirm": [], "allow": [] } }
  }
}
```
HTTP `201 Created`.

#### Error Responses

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `403` | `MFA_REQUIRED_FOR_PAM` | `user.mfa_enabled == false` — PAM menolak tanpa MFA, tanpa kecuali |
| `403` | `PAM_STEP_UP_REQUIRED` | Verifikasi MFA terakhir > window policy (default 15 menit) dan `otp` tidak dikirim |
| `403` | `PAM_POLICY_DENIED` | Policy nonaktif/NULL, CIDR allowlist, approval/ticket |
| `401` | `UNAUTHORIZED` | OTP tidak valid/replay, token kedaluwarsa |
| `429` | `RATE_LIMITED` | 5 kegagalan OTP / 15 menit (lockout) |

### `GET /api/v1/pam/sessions` & `GET /api/v1/pam/sessions/{id}`
- **Auth & Permissions**: Bearer JWT + company aktif. Audit trail append-only: `status` (`REQUESTED|AUTHORIZED|ACTIVE|CLOSED|DENIED|EXPIRED`), `source_ip`, `recording_object_key`, `denied_reason`, `duration_seconds`. Ticket hash & secret tidak pernah diekspos.

### `POST /api/v1/agents/pam/ticket/redeem`
- **Auth & Permissions**: Agent HMAC (`pam_bastion_gateway`).

#### Request Schema
```json
{ "session_id": "uuid", "ticket": "hex dari respons authorize" }
```

#### Response Schema (sukses)
```json
{
  "status": "success",
  "data": {
    "session_id": "uuid",
    "target": { "asset_id": "...", "asset_name": "...", "host": "fqdn|hostname|mgmt_ip", "port": 22 },
    "account": { "username": "...", "account_type": "SSH_PASSWORD", "secret": "plaintext (sekali, jalur internal)" },
    "policy": { "command_filter": {}, "max_session_minutes": 120 }
  }
}
```

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `401` | `UNAUTHORIZED` | Ticket hash tidak cocok / kedaluwarsa (TTL) |
| `409` | `CONFLICT` | Ticket sudah ditebus (`status ≠ AUTHORIZED`) — sekali pakai atomik |
| `404` | `NOT_FOUND` | Sesi milik tenant lain / tidak ada |

### `POST /api/v1/pam/sessions/{id}/recording?format=CAST_GZ`
- **Auth & Permissions**: Agent HMAC (body biner diikat `sha256_hex(body)` pada kanonis signature).
- **Content-Type**: `application/octet-stream` (raw body, bukan multipart).
- **Batas ukuran**: `PAM_RECORDING_MAX_MB` (default 100 MB, clamp 1–512) — `413 PAYLOAD_TOO_LARGE`.
- **Query**: `format=CAST_GZ|ASCIINEMA|MP4` (default `CAST_GZ`).
- **Magic bytes**: gzip `1F 8B` (CAST_GZ; ASCIINEMA juga menerima `{` JSON), MP4 `ftyp` @ offset 4 — mismatch → `400`.
- **Tujuan**: bucket privat `RUSTFS_BUCKET_PAM` (default `osc-pam-recordings`), key `pam/{company_id}/{session_id}/{uuidv7}.{ext}`; registry `file_assets` (`PAM_RECORDING`, sha256) + pointer `pam_session_logs.recording_object_key` (DB hanya metadata — bab 5.8).

#### Response Schema
```json
{
  "status": "success",
  "data": {
    "session_id": "uuid", "file_id": "uuid", "bucket": "osc-pam-recordings",
    "object_key": "pam/.../....cast.gz", "size_bytes": 1048576, "sha256": "hex-64"
  }
}
```
HTTP `201 Created`.

### CRUD `/api/v1/notifications/channels`
- **Auth & Permissions**: Bearer JWT + company aktif. `UNIQUE (company_id, type)` → satu channel per tipe per tenant.

#### `POST /api/v1/notifications/channels` Request Schema
```json
{
  "channel_type": "SMTP_EMAIL|TELEGRAM|WEBHOOK",
  "config": {
    "host": "smtp.corp.local", "port": 587, "username": "...",
    "password": "***", "from_email": "noreply@corp.local", "use_tls": true
  },
  "event_filter": ["ALERT.FIRING", "SIEM.CRITICAL", "PAM.SESSION_AUTHORIZED"],
  "is_active": true
}
```
- `SMTP_EMAIL`: `host` (tanpa scheme, ≤255), `port` (default 587), `from_email` wajib; `password` = secret.
- `TELEGRAM`: `bot_token` (≤64, tanpa spasi) + `chat_id` wajib; `parse_mode` opsional (`HTML|MARKDOWN|MARKDOWNV2`).
- `WEBHOOK`: `url` http(s) ≤500, **kredensial inline `user:pass@` dilarang**; `secret` (HMAC signing) opsional.

Config disimpan sebagai `{"enc": "<base64 Envelope AES-256-GCM>"}` di kolom JSONB; respons hanya `config_summary` (`has_password`, `has_bot_token`, `has_secret` — secret di-mask). `event_filter` ≤ 32 entri, uppercase, ≤100 char.

#### Response Schema (sukses)
```json
{
  "status": "success",
  "data": { "id": "uuid", "config_summary": { "host": "...", "has_password": true } }
}
```
HTTP `201`. `GET` mengembalikan channel dengan `config` = ringkasan ter-mask (dekripsi sementara in-memory untuk membuat ringkasan). `PUT` (config/event_filter/is_active), `DELETE` soft.

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Tipe/field config tidak valid, webhook URL ber-kredensial inline, event_filter > 32 |
| `409` | `CONFLICT` | Channel dengan tipe sama sudah ada pada company |

### `POST /api/v1/agents/retention/purge`
- **Auth & Permissions**: Agent HMAC **+ allowlist env `RETENTION_PURGE_AGENT_IDS`** (CSV `agent_id`; kosong = semua ditolak — deny-by-default; endpoint internal `flow_worker_agent`).

#### Request Schema
```json
{ "dry_run": false }
```

#### Response Schema
```json
{
  "status": "accepted",
  "data": {
    "dry_run": false,
    "purged": {
      "system_metric_snapshots": 1240,
      "container_metric_snapshots": 860,
      "uptime_heartbeats": 430,
      "fim_baseline_events": 12,
      "security_alert_events": 3,
      "compliance_check_results": 0
    }
  }
}
```

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `403` | `FORBIDDEN` | Agent tidak terdaftar pada `RETENTION_PURGE_AGENT_IDS` |

Batch `DELETE ... WHERE id IN (SELECT ... LIMIT 1000)` maksimum 200 iterasi/tabel + throttling 25 ms antar tabel — lock pendek (bab 5.8). Kebijakan hari: metrik tier-1m `RETENTION_METRIC_DAYS` (30, clamp 30–90), tier-10m `RETENTION_METRIC_TIER10_DAYS` (90), heartbeat `RETENTION_HEARTBEAT_DAYS` (30), SecOps `RETENTION_SECOPS_DAYS` (365). Rekaman PAM TIDAK di-purge (arsip immutable di RustFS, DB hanya pointer). Setiap eksekusi tercatat `ActivityLog RETENTION_PURGE`.

---

## 3. Storage (RustFS), Cryptography & Database Interaction

- **PostgreSQL**: tabel `fim_baseline_events`, `security_alert_events`, `vulnerability_findings` (upsert `UNIQUE (asset_id, cve_id)`), `compliance_check_results` (upsert 4 kolom), `pam_access_policies` (read-only di API — pengelolaan via admin), `pam_vault_accounts`, `pam_session_logs` (append-only), `notification_channels`, `file_assets` (registry rekaman). Enum PG dibind `CAST($n AS <enum_type>`; `INET` via `CAST($n AS inet)`; `INET[]` dibaca `::text[]` lalu diparse `infrastructure::cidr`. Semua query runtime parameterized (`$n` / `QueryBuilder::push_bind`) — zero SQL injection surface; nama tabel retensi dari enum Rust (bukan input).
- **RustFS**: bucket umum (`RUSTFS_BUCKET`) untuk attachment/excel; bucket privat rekaman `RUSTFS_BUCKET_PAM` (default `osc-pam-recordings`) via `put_object_in` — pemisahan policy akses S3 per bucket. Object key selalu `pam/{company_id}/{session_id}/{uuidv7}.{ext}` (UUIDv7, anti path-traversal/enumerasi).
- **Encryption at Rest (Envelope AES-256-GCM, KEK = `APP_MASTER_ENCRYPTION_KEY` hex-64)**:
  - Secret vault akun PAM (password/private key) → `pam_vault_accounts.secret_encrypted` BYTEA, blob `OMS1|nonce_dek|dek_blob|nonce_data|ciphertext` (DEK acak per secret — vault 2 lapis, KEK ≠ DEK; pengganti anti-pattern AES-ECB JumpServer legacy).
  - Config notification channel → JSONB `{"enc": base64}` — seluruh config terenkripsi.
  - WS ticket PAM → hanya SHA-256 (`ws_ticket_hash`); plaintext sekali tampil pada authorize.
  - Secret TOTP user (verifikasi step-up) — warisan W1 (`mfa_secret_encrypted`).

## 4. Security Controls & Threat Mitigation

- **Mandatory MFA + Step-up**: hard reject `403 MFA_REQUIRED_FOR_PAM` tanpa pengecualian role; step-up OTP wajib bila verifikasi terakhir > window policy (default 15 menit) — anti replay via `mfa_last_verified_step` (step ≤ tersimpan ditolak) + rate-limit 5 gagal/15 menit (lockout) dengan key `mfa:{user_id}`.
- **Ephemeral ticket**: 256-bit acak, TTL ≤ 120 s, sekali pakai (redeem atomik `WHERE status='AUTHORIZED'`), hash-only di DB; secret target hanya turun pada redeem ke gateway internal.
- **Tenant isolation & IDOR**: `active_company_id` dari sesi (JWT) atau baris agent (HMAC); semua load company-scoped; `asset_id` event dipaksa identik agent pelapor (anti-spoof).
- **CIDR ACL**: parser mandiri `infrastructure::cidr` (IPv4/IPv6, host = /32|/128, prefix out-of-range ditolak, cross-family tidak match); entri malformed = deny; `X-Forwarded-For` hop pertama.
- **Rekaman**: magic-byte validation (bukan sekadar extension), ukuran terbatas, key acak, bucket privat, sha256 registry; DB hanya pointer (immutable audit).
- **Zero secret leakage**: `secret` vault, `bot_token`, webhook secret, ticket — tidak pernah di-log; tracing lewat `logging::redact`; respons API hanya `has_*`/masked summary.
- **SQL injection**: 100% parameterized; dynamic SQL hanya melalui enum Rust + `sqlx::AssertSqlSafe` pada SQL yang dibangun dari enum (audit manual terdokumentasi).
- **Retention**: batch + throttling + max iterasi (lock pendek), dry-run flag, deny-by-default allowlist, ActivityLog audit; kebijakan hari di-clamp agar nilai liar tidak melumpuhkan keamanan/pemulihan.
- **Zero `.unwrap()`/`.expect()`** pada jalur request; error di-propagasi `Result<T, AppError>`; detail infrastruktur hanya masuk log (envelope generik ke klien).
