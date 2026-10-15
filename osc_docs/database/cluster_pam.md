# Osc_base — `prisma/schema/cluster_pam.prisma`

> Dokumen detail cluster **PAM** — Bastion / Privileged Access Management
> (`pam_*`). 🔗 Kembali ke [database/README.md](README.md).
> Rencana modul: [../planning/app_pam.md](../planning/app_pam.md).
>
> ✅ **Status: sudah dibangun.** Seluruh 20 model cluster `pam_*` telah
> terpasang di `prisma/schema/cluster_pam.prisma` beserta migrasinya.

## 1. Ringkasan

Cluster PAM menyimpan **target akses** (server/VM/perangkat/container),
**vault kredensial istimewa** (terenkripsi), **kebijakan & hibah akses**,
**sesi** beserta **audit perintah**, filter perintah, dan permintaan akses.

## 2. Model

### 2.1 `pam_asset` — Target Akses
- `@@unique([company_id, code])`; `category` ∈
  `SERVER | VM | NETWORK | CONTAINER | DB`; `protocol` ∈ `SSH | SFTP | RDP | VNC | TELNET?`.
- `host`, `port`, `os`, `tags` (Json); tautan opsional `amm_asset_id` /
  `vms_guest_id` / `net_device_id` / `pod_container_id`.

### 2.2 `pam_account` — Kredensial Istimewa
- `@@unique([asset_id, name])`; `auth_type` ∈ `PASSWORD | SSH_KEY | AGENT`.
- `secret_enc` / `key_enc` / `passphrase_enc` (**terenkripsi**);
  `privileged`, `auto_rotate`, `rotate_interval_days`, `last_rotated_at`, `template_id?`.

### 2.2a `pam_account_template` — Template Akun
- `@@unique([company_id, code])`; `username`?, `auth_type` ∈ `PASSWORD | SSH_KEY | AGENT`, `secret_enc`?, `key_enc`?, `passphrase_enc`?, `privileged`, `is_active`.

### 2.3 `pam_policy` — Kebijakan Akses
- `@@unique([company_id, code])`; `protocols`/`actions`/`time_window` (Json) (actions meliputi CONNECT/SFTP_UP/SFTP_DOWN/CLIPBOARD_*),
  `command_filter_id`, `require_approval`, `require_mfa`, `mfa_methods` (Json), `require_reason`,
  `max_session_min`, `idle_timeout`?, `single_device`?, `max_concurrent`?, `session_expire_on_close`?, `is_active`.

### 2.4 `pam_grant` — Hibah Akses
- `user_id` (→ `app_user`), `asset_id`?/`account_id`?, `policy_id`,
  `valid_from`, `valid_until`?, `is_active`; indeks `[company_id, user_id]`.

### 2.5 `pam_command_filter` — Filter Perintah
- `@@unique([company_id, name])`; `pattern` (regex), `action` ∈
  `ALLOW | BLOCK | ALERT | APPROVE`, `priority`, `is_active`.

### 2.5a `pam_command_filter_binding` — Binding Filter (granularity)
- `filter_id`, `user_id`?, `asset_id`?, `account_id`?, `priority`?, `is_active`; indeks `[company_id, filter_id]`.

### 2.6 `pam_session` — Sesi
- `user_id`, `asset_id`, `account_id`, `protocol`, `entry` ∈ `WS | GATEWAY | NATIVE_RDP`,
  `src_ip`, `reason`, `mfa_verified`, `mfa_method`?, `watermark`, `clipboard_enabled` (Json)?, `share_token`?, `shared_by`?, `shared_until`?, `started_at`, `ended_at`, `last_active_at`?,
  `status` ∈ `ACTIVE | CLOSED | FAILED | BLOCKED | EXPIRED`, `recording_path`,
  `recording_size`, `bytes_in/out`, `command_count`, `relay_agent_id`.
- Indeks `[company_id, started_at]`, `[user_id, started_at]`, `[share_token]`.

### 2.7 `pam_command` — Audit Perintah (telemetry)
- `session_id`, `seq`, `ts`, `command`, `risk_level`, `action` ∈
  `ALLOWED | BLOCKED | ALERT | APPROVED`, `output_size`, `store_ref`?; indeks `[session_id, seq]`.

### 2.8 `pam_access_request` — Permintaan Akses
- `user_id`, `asset_id`?/`account_id`?, `protocol`, `reason`, `desired_from`,
  `desired_until`, `status` ∈ `PENDING | APPROVED | REJECTED | EXPIRED | CANCELLED`,
  `approver_id`?, `decided_at`?, `ticket_ref`?, `ticket_provider`?, `approval_flow_id`?, `approval_step`?; indeks `[company_id, status]`.

### 2.8a `pam_approval_flow` — Multi-level Approval
- `@@unique([company_id, name])`; `steps` (Json), `is_active`.

### 2.8b `pam_approval_step` — Langkah Approval
- `flow_id`, `approver_role_id`?, `approver_user_id`?, `min_approvers`, `order`, `timeout_min`?; indeks `[flow_id, order]`.

### 2.8c `pam_access_request_approval` — Approval Per Step
- `request_id`, `step_id`, `approver_id`, `status` (PENDING/APPROVED/REJECTED), `decided_at`?, `note`?; indeks `[request_id, step_id]`.

### 2.9 `pam_gateway` — SSH Gateway Native
- `@@unique([company_id, code])`; `listen_host`, `listen_port`,
  `host_key_enc` (**terenkripsi**), `allowed_networks` (Json), `is_active`.
- Memungkinkan `ssh <user>@<bastion>` (selain terminal WebSocket).

### 2.10 `pam_login_acl` — **MAJOR — Login ACL Bastion**
- `@@unique([company_id, code])`; `type` (ALLOW/DENY), `ip_cidr`?, `user_id`?, `role_id`?, `time_window` (Json)?, `priority`, `is_active`.

### 2.11 `pam_lockout` — Failed-login Lockout
- `identifier` (user_id/IP), `type` (USER/IP), `fail_count`, `locked_until`?, `last_fail_at`?; indeks `[type, identifier]`.

### 2.12 `pam_apikey` — API Keys/PAT
- `user_id`, `name`, `key_hash`, `scopes` (Json), `last_used_at`?, `expires_at`?, `revoked_at`?, `is_active`; `@@unique([key_hash])`.

### 2.13 `pam_health_check` — Component Health
- `component` (GATEWAY/GUACD/STORAGE/ELASTIC/OTHER), `status` (OK/DEGRADED/FAIL), `last_check_at`, `details` (Json), `message`?; indeks `[component, last_check_at]`.

### 2.14 `pam_discovery_job` — Account Discovery
- `asset_id`?, `status` (PENDING/RUNNING/COMPLETED/FAILED), `started_at`?, `finished_at`?, `result` (Json)?; indeks `[company_id, started_at]`.

### 2.15 `pam_ticket_provider` — External Ticket System
- `@@unique([company_id, code])`; `type` (JIRA/SERVICENOW/WEBHOOK/GENERIC), `config_enc`?, `is_active`.

## 3. Relasi Inti

```text
pam_asset (1) ──► (N) pam_account ──► (N) pam_session ──► (N) pam_command
    ├── pam_account_template? (template_id)
    └── pam_policy ──► pam_command_filter
                     └── pam_command_filter_binding
pam_grant ──► app_user (user_id) · pam_asset/pam_account/pam_policy
pam_access_request ──► app_user · pam_asset/pam_account
pam_access_request ──► pam_approval_flow ──► pam_approval_step ──► pam_access_request_approval
pam_ticket_provider ──► pam_access_request
pam_gateway ──(native SSH)──► pam_grant ──► pam_session
pam_login_acl ──(filter login bastion)
pam_lockout ──(failed login)
pam_apikey ──► app_user (user_id)
pam_discovery_job ──► pam_asset / pam_account
pam_health_check (component health)
pam_asset ──(opsional)── amm_asset · vms_guest · net_device · pod_container
pam_session.relay_agent_id ──► bot_agent (BOT)
```

## 4. Catatan

- **Rahasia wajib terenkripsi** (`secret_enc`/`key_enc`/`passphrase_enc`); tidak
  ada endpoint reveal.
- `pam_command` = telemetry audit → purge via `retention.go`
  (`RE_DAYS_PAM_COMMAND`); dapat disimpan via **pluggable command-log store** (Local/Null/Elasticsearch) dengan referensi `store_ref`.
- `pam_session` metadata panjang; rekaman di disk/objek. Dukungan `idle_timeout`, `last_active_at`, `clipboard_enabled`, `share_token`, `entry` termasuk `NATIVE_RDP`, `status` termasuk `EXPIRED`.
- `pam_asset`/`pam_account`/`pam_account_template`/`pam_policy`/`pam_grant`/`pam_command_filter`/`pam_command_filter_binding`/
  `pam_access_request`/`pam_approval_flow`/`pam_approval_step`/`pam_access_request_approval`/`pam_gateway`/`pam_login_acl`/`pam_lockout`/`pam_apikey`/`pam_health_check`/`pam_discovery_job`/`pam_ticket_provider` → persisten. MFA per koneksi (`mfa_verified`, `mfa_method`), watermark grafis, clipboard control, dan `reason` wajib bila policy menetapkannya. **Login ACL (MAJOR)** dan **lockout** mengamankan akses ke bastion itu sendiri.
- Tautan lintas-cluster (opsional) ke `amm_asset`, `vms_guest`, `net_device`,
  `pod_container`, dan `app_user`; relasi dijaga eksplisit.
- Prisma/migrasi: **sudah dibuat** (lihat
  [../planning/app_pam.md](../planning/app_pam.md)).
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
