# Planning `PAM` — Bastion / Privileged Access Management (ala JumpServer)

> Rencana modul **`PAM`** sebagai **gerbang akses terpusat** (bastion/jump host)
> untuk **SSH/SFTP/RDP/VNC** ke server, VM, perangkat jaringan, dan container:
> **credential vault**, **RBAC per-aset**, **perekaman + replay sesi**, **live
> monitoring**, **command filter/approval**, dan **audit penuh**. Penyejajar
> **JumpServer**/**Teleport**. Bagian dari [Planning](README.md) · Lihat juga
> [blueprint](blueprint.md), [roadmap](roadmap.md), [checklist](checklist.md),
> serta modul terkait [AMM](app_amm.md) (aset/target), [VMS](app_vms.md) (guest),
> [NET](app_net.md) (perangkat), [POD](app_pod.md) (container), dan `BOT` (agen).

## 1. Tujuan & Lingkup

Menyediakan satu pintu akses istimewa dengan kontrol & audit:

- **Gateway protokol** — **SSH** (+ **SFTP**), **RDP**, **VNC** (mencakup opsi **Telnet** — lihat §13) lewat satu
  konsol; sesi diproksi (bukan kredensial dibagikan ke user).
- **Credential vault** — simpan kredensial istimewa (password, SSH key,
  passphrase) **terenkripsi**; user menyambung lewat bastion tanpa tahu
  kredensial asli (_checkout_ terkendali). Dukung **account template** (`pam_account_template`) untuk berbagi kredensial terstandar lintas banyak akun.
- **RBAC per-aset** — siapa boleh mengakses aset/akun mana, protokol apa,
  kapan (**time window**), aksi apa (connect/upload/download). Dukung **command-filter binding granularity** per `user×asset×account` dengan **priority** (perluasan dari per-policy).
- **Perekaman sesi** — rekam terminal (aschicast) & grafis (RDP/VNC) untuk
  **replay** audit.
- **Live monitoring** — pantau sesi berjalan real-time; **shadow** & **terminate**.
- **Command filter** — blokir/peringatkan/approve perintah berisiko (regex).
- **Approval** — permintaan akses & approval perintah berisiko (integrasi `APP04`). Mendukung **multi-level approval** (N-of-M / staged approvals) memperluas model single `approver_id`.
- **SSH gateway native** — endpoint SSH di bastion agar user dapat
  `ssh user@bastion` dari klien asli (selain WebSocket terminal).
- **Native RDP client connect method** — dukungan jalur koneksi klien RDP native (mstsc) termasuk gateway path, selain metode WebSocket/RDP melalui `guacd`.
- **MFA per koneksi** — verifikasi faktor kedua saat membuka sesi. Mendukung opsi **TOTP**, **WebAuthn/Passkey**, dan **RADIUS MFA** (perluasan dari TOTP saja).
- **Watermark** — lapisan watermark pada sesi grafis (RDP/VNC) berisi identitas
  user/waktu.
- **Clipboard control (RDP/VNC)** — kontrol copy-paste per arah (local→remote / remote→local), dapat dikonfigurasi per kebijakan (bersama `SFTP_UP`/`SFTP_DOWN`).
- **Alasan wajib** — user mengisi **reason** saat connect (tersimpan di sesi).
- **Audit** — seluruh perintah, unggahan, dan akses terekam (`pam_session`,
  `pam_command`, `USLogs`). **Pluggable command-log store** untuk `pam_command` (Local / Null / Elasticsearch) via abstraksi storage.
- **Login ACL to the bastion itself (MAJOR)** — kontrol akses login ke bastion (IP whitelist/blacklist), **login time window**, serta **failed-login user/IP lockout** (`pam_login_acl` + pengaturan terkait).
- **Session share / invite** — berbagi sesi aktif web SSH/RDP/VNC via link dengan batas waktu/izin.
- **Bulk import/export** — impor/ekspor assets/accounts (CSV/Excel) beserta template.
- **External ticket-system integration** — integrasi provider tiket/webhook ke `pam_access_request`.
- **Timeouts** — `max_session_min` (max online time) dan **idle timeout** terpisah (`idle_timeout`) untuk menghentikan sesi idle.
- **Session security caps** — **login-failure lockout** + **single-device/concurrent-session cap** (per user/per policy) di pengaturan.
- **Session expiry on browser close** — opsi kebijakan untuk menghentikan/menandai sesi saat browser ditutup.
- **Account discovery/collection** — job opsional untuk menemukan/mengumpulkan akun dari aset ke `pam_account`.
- **API keys / personal access tokens** — PAT/API key untuk otomatisasi `pam_gateway`/API.
- **Component health check/status** — endpoint/status page untuk `gateway`/`guacd`/`storage` (dan dependensi terkait).
- **Multi-tenant** — per `company_id`, RBAC OmniSight.

> **Tidak menyimpan kredensial plaintext.** Semua rahasia dienkripsi
> (`mechanic.crypto`) dan **tidak pernah** dikembalikan mentah ke UI. Koneksi
> keluar dari bastion ke target; agen hanya **relay** untuk segmen jaringan
> terisolasi.

## 2. Referensi Fitur (JumpServer · Teleport · Guacamole)

| Area | Referensi | Target `PAM` |
|---|---|---|
| SSH / SFTP | JumpServer, Teleport | ✅ (fase A) |
| RDP / VNC | JumpServer, Guacamole | ✅ (fase B, via `guacd` opsional) |
| Web/DB/K8s proxy | JumpServer, Teleport | ⏸️ menyusul |
| Credential vault + checkout | JumpServer | ✅ |
| RBAC per-aset & time window | JumpServer, Teleport | ✅ |
| Session recording + replay | semua | ✅ (asciicast + grafis) |
| Live session monitor / shadow / kill | JumpServer, Teleport | ✅ |
| Command filter / ACL | JumpServer | ✅ |
| Login & command approval | JumpServer | ✅ (integrasi `APP04`) |
| Access request (ticket) | JumpServer | ✅ (sederhana; diperluas multi-level + external ticket system) |
| Password rotation | JumpServer | ✅ (`pam_account.auto_rotate` + jadwal) |
| MFA per koneksi | semua | ✅ (TOTP/WebAuthn/Passkey/RADIUS, per sesi) |
| SSH gateway native (`ssh user@bastion`) | JumpServer, Teleport | ✅ (`pam_gateway`) |
| Watermark sesi grafis | JumpServer | ✅ (RDP/VNC) |
| Alasan wajib saat connect | JumpServer | ✅ (`pam_session.reason`) |
| Cloud/DB proxy eksotis | Teleport | ❌ non-goal fase awal |
| **Login ACL bastion (IP/time/lockout)** | JumpServer | ✅ **(MAJOR)** |
| **Clipboard control (RDP/VNC)** | JumpServer, Guacamole | ✅ **(MAJOR)** |
| **Session share/invite** | JumpServer | ✅ |
| **Pluggable command-log store** | JumpServer (opsional) | ✅ (Local/Null/Elasticsearch) |
| **Account templates** | JumpServer | ✅ |
| **Bulk import/export (CSV/Excel)** | JumpServer | ✅ |
| **External ticket-system integration** | JumpServer | ✅ |
| **Multi-level approval** | JumpServer | ✅ |
| **Idle timeout distinct from max online time** | JumpServer | ✅ |
| **Login-failure lockout + single-device/concurrent-session cap** | JumpServer | ✅ |
| **WebAuthn/Passkey + RADIUS MFA** | JumpServer | ✅ |
| **Native RDP client connect method (mstsc)** | JumpServer | ✅ |
| **Account discovery/collection** | JumpServer | ✅ |
| **Command-filter binding granularity (user×asset×account)** | JumpServer | ✅ |
| **API keys/PAT** | JumpServer/Teleport | ✅ |
| **Session expiry on browser close** | JumpServer | ✅ |
| **Telnet** | (per kebutuhan) | 🔍 (lihat §13) |
| **Component health check/status page** | Operasional | ✅ |

**Referensi alat**: JumpServer, Teleport, Apache Guacamole.

## 3. Keputusan Arsitektur (draft — perlu konfirmasi §14)

1. **Kode modul:** `PAM` (Bastion/PAM) — halaman `PAM01`.. .
2. **Cluster DB:** `pam_*` (file baru `cluster_pam.prisma` + `cluster_pam.md`).
3. **Proxy engine:** di **`osc_rest`** (`mechanic/pam/`) — SSH via
   `golang.org/x/crypto/ssh`; WS proxy pola `mechanic/sshproxy.go`. Backend =
   penghubung tunggal DB.
4. **RDP/VNC:** via **`guacd`** (Guacamole proxy, add-on opsional) untuk
   rekaman grafis; VNC sederhana dapat memakai **noVNC** (reuse `VMS`). **Native RDP client** (mstsc) disediakan sebagai jalur alternatif (gateway path) terpisah dari WebSocket.
5. **Agen relay:** untuk target di segmen jaringan yang tak terjangkau
   backend, `osc_auto/agent_vm` (capability **`pam`**) meneruskan koneksi.
   Agen **tidak** mengakses DB; rahasia diteruskan terenkripsi per sesi.
6. **Vault:** rahasia dienkripsi (`mechanic.crypto`); disimpan `secret_enc`/
   `key_enc`/`passphrase_enc`. **Tidak** ada endpoint yang mengembalikan
   plaintext; checkout hanya dipakai internal saat membuka sesi. Dukungan **account template** (`pam_account_template`) untuk mengelola kredensial bersama.
7. **Perekaman:** SSH → **asciicast v2** (teks); RDP/VNC → rekaman `guacd`
   (`.guac`/MP4) atau tangkapan berkala. Metadata `pam_session`, file di disk
   (`base_dir`), opsional S3 menyusul. **Command-log store** dapat dipilih via abstraksi (Local/Null/Elasticsearch).
8. **Command filter:** pencocokan regex pesan→block/alert/approve; perintah
   terblokir tidak diteruskan + dicatat `pam_command`. Dapat dibinding per **user×asset×account** dengan **priority**.
9. **Approval & access request:** alur persetujuan memakai `APP04`/`BOOK`;
   akses berbatas waktu (`valid_until`). Mendukung **multi-level approval** (N-of-M/staged) serta **external ticket system/webhook** untuk menghubungkan ke sistem tiket eksternal.
10. **Protokol fase awal:** **SSH(+SFTP)** dulu; **RDP/VNC** fase berikutnya. **Telnet** perlu penilaian eksplisit (lihat §13).
11. **Target terhubung modul:** `pam_asset` menautkan ke `amm_asset`/
    `vms_guest`/`net_device`/`pod_container` (opsional) agar inventaris menyatu.
12. **SSH gateway native:** backend mendengarkan **port SSH** (`pam_gateway`, host
    key dikelola) → autentikasi user bastion → peta ke `pam_grant` → proxy ke
    target. Selain WebSocket terminal. **API keys/PAT** dapat digunakan untuk akses otomatisasi ke `pam_gateway`/API.
13. **MFA per koneksi:** opsional per policy (`pam_policy.require_mfa`); mendukung **TOTP**, **WebAuthn/Passkey**, **RADIUS MFA**.
14. **Watermark & reason:** watermark pada sesi grafis (RDP/VNC); **reason wajib**
    saat connect bila `pam_policy.require_reason`.
15. **Security controls (MAJOR):** **Login ACL to the bastion itself** (IP whitelist/blacklist, login time window, failed-login user/IP lockout) dikelola via `pam_login_acl` + tab settings terkait.
16. **Clipboard control (MAJOR):** kontrol copy-paste RDP/VNC per arah (local↔remote), dikonfigurasi per policy (bersama aksi SFTP).
17. **Session management:** **idle timeout** terpisah dari `max_session_min`; **session expiry on browser close** (opsional); **login-failure lockout** + **single-device/concurrent-session cap**; **session share/invite** untuk sesi aktif web SSH/RDP/VNC.
18. **Operations:** **bulk import/export** (CSV/Excel) + templates; **account discovery/collection** dari aset; **component health check/status page** (gateway/guacd/storage).

## 4. Arsitektur & Topologi

```
Browser ──► osc_site (:37773) ──/proxy/pages/PAM/*──► osc_rest (:37772)
                                                          │  orkestrasi + RBAC + vault + audit
    Browser ──WS (terminal/RDP)──► osc_rest/mechanic/pam
                                       │  SSH (x/crypto/ssh) · RDP/VNC (guacd)
                                       ├──► target langsung
                                       └──► /rest/agent ──► agent_vm (capability bastion)
                                                                  └──► target di segmen terisolasi
    osc_rest ──pgx──► PostgreSQL (pam_*)
    osc_rest ──disk──► recording (asciicast/guac) + metadata pam_session
```

- **Backend = penghubung tunggal ke DB & vault**; agen = relay koneksi.
- **Tanpa membagikan kredensial** ke user: bastion membuka sesi atas nama user.
- **Sesi keluar** dari bastion/agen, bukan dari browser user.

## 5. Model Database — cluster `pam_*`

| Model | Isi pokok | Kunci |
|---|---|---|
| `pam_asset` | Target akses: `code`, `name`, `category` (SERVER/VM/NETWORK/CONTAINER/DB), `protocol` (SSH/RDP/VNC/SFTP/TELNET?), `host`, `port`, `os`?, `tags`?, `amm_asset_id`?/`vms_guest_id`?/`net_device_id`?/`pod_container_id`?, `is_active` | `@@unique([company_id, code])` |
| `pam_account` | Kredensial istimewa: `asset_id`, `name`, `username`, `auth_type` (PASSWORD/SSH_KEY/AGENT), `secret_enc`?, `key_enc`?, `passphrase_enc`?, `privileged` (Bool), `auto_rotate` (Bool), `rotate_interval_days`?, `last_rotated_at`?, `is_active`, `template_id`? (opsional) | `@@unique([asset_id, name])` |
| `pam_account_template` | Template akun bersama: `code`, `name`, `username`?, `auth_type` (PASSWORD/SSH_KEY/AGENT), `secret_enc`?, `key_enc`?, `passphrase_enc`?, `privileged` (Bool), `is_active` | `@@unique([company_id, code])` |
| `pam_policy` | Kebijakan akses: `code`, `name`, `protocols` (Json), `actions` (Json: CONNECT/SFTP_UP/SFTP_DOWN/CLIPBOARD_LOCAL_TO_REMOTE/CLIPBOARD_REMOTE_TO_LOCAL), `command_filter_id`?, `require_approval` (Bool), `require_mfa` (Bool), `mfa_methods` (Json: TOTP/WEBAUTHN/PASSKEY/RADIUS)?, `require_reason` (Bool), `max_session_min`, `idle_timeout`?, `time_window` (Json), `single_device` (Bool)?, `max_concurrent`?, `session_expire_on_close` (Bool)?, `is_active` | `@@unique([company_id, code])` |
| `pam_grant` | Hibah akses: `user_id` (→ `app_user`), `asset_id`?, `account_id`?, `policy_id`, `valid_from`, `valid_until`?, `is_active` | indeks `[company_id, user_id]` |
| `pam_command_filter` | Aturan perintah: `name`, `pattern` (regex), `action` (ALLOW/BLOCK/ALERT/APPROVE), `priority`, `is_active` | `@@unique([company_id, name])` |
| `pam_command_filter_binding` | Binding filter per-granularity: `filter_id`, `user_id`?, `asset_id`?, `account_id`?, `priority`?, `is_active` | indeks `[company_id, filter_id]` |
| `pam_session` | Sesi: `user_id`, `asset_id`, `account_id`, `protocol`, `entry` (WS/GATEWAY/NATIVE_RDP), `src_ip`, `reason`?, `mfa_verified` (Bool), `mfa_method`?, `watermark` (Bool), `clipboard_enabled` (Json)?, `share_token`?, `shared_by`?, `shared_until`?, `started_at`, `ended_at`?, `last_active_at`?, `status` (ACTIVE/CLOSED/FAILED/BLOCKED/EXPIRED), `recording_path`?, `recording_size`?, `bytes_in`/`bytes_out`, `command_count`, `relay_agent_id`? | indeks `[company_id, started_at]`, `[user_id, started_at]`, `[share_token]` |
| `pam_command` | Audit perintah (telemetry): `session_id`, `seq`, `ts`, `command`, `risk_level`, `action` (ALLOWED/BLOCKED/ALERT/APPROVED), `output_size`, `store_ref`? | indeks `[session_id, seq]` |
| `pam_access_request` | Permintaan akses: `user_id`, `asset_id`?, `account_id`?, `protocol`, `reason`, `desired_from`, `desired_until`, `status` (PENDING/APPROVED/REJECTED/EXPIRED/CANCELLED), `approver_id`?, `decided_at`?, `ticket_ref`?, `ticket_provider`?, `approval_flow_id`?, `approval_step`? | indeks `[company_id, status]` |
| `pam_approval_flow` | Multi-level approval: `name`, `steps` (Json: N-of-M/staged), `is_active` | `@@unique([company_id, name])` |
| `pam_approval_step` | Detail langkah approval: `flow_id`, `approver_role_id`?, `approver_user_id`?, `min_approvers`, `order`, `timeout_min`? | indeks `[flow_id, order]` |
| `pam_access_request_approval` | Approval per step: `request_id`, `step_id`, `approver_id`, `status` (PENDING/APPROVED/REJECTED), `decided_at`?, `note`? | indeks `[request_id, step_id]` |
| `pam_gateway` | Konfigurasi SSH gateway native: `code`, `name`, `listen_host`, `listen_port`, `host_key_enc`, `allowed_networks` (Json), `is_active` | `@@unique([company_id, code])` |
| `pam_login_acl` | **MAJOR — Login ACL to the bastion itself**: `code`, `name`, `type` (ALLOW/DENY), `ip_cidr`?, `user_id`?, `role_id`?, `time_window` (Json)?, `priority`, `is_active` | `@@unique([company_id, code])` |
| `pam_lockout` | Failed-login lockout: `identifier` (user_id atau IP), `type` (USER/IP), `fail_count`, `locked_until`?, `last_fail_at`? | indeks `[type, identifier]` |
| `pam_apikey` | API keys/PAT: `user_id`, `name`, `key_hash`, `scopes` (Json), `last_used_at`?, `expires_at`?, `revoked_at`?, `is_active` | `@@unique([key_hash])` |
| `pam_health_check` | Component health: `component` (GATEWAY/GUACD/STORAGE/ELASTIC/OTHER), `status` (OK/DEGRADED/FAIL), `last_check_at`, `details` (Json), `message`? | indeks `[component, last_check_at]` |
| `pam_discovery_job` | Account discovery: `asset_id`?, `status` (PENDING/RUNNING/COMPLETED/FAILED), `started_at`?, `finished_at`?, `result` (Json)? | indeks `[company_id, started_at]` |
| `pam_ticket_provider` | External ticket system: `code`, `name`, `type` (JIRA/SERVICENOW/WEBHOOK/GENERIC), `config_enc`?, `is_active` | `@@unique([company_id, code])` |

Relasi inti:

```text
pam_asset (1) ──► (N) pam_account ──► (N) pam_session
    │                    │                 ├── (N) pam_command
    │                    │                 └── pam_access_request (opsional)
    │                    └── pam_grant ──► app_user (user_id)
    │
    ├── pam_account_template? (template_id)
    └── pam_policy ──► pam_command_filter
                     └── pam_command_filter_binding
pam_access_request ──► pam_approval_flow ──► pam_approval_step ──► pam_access_request_approval
pam_asset ──(opsional)── amm_asset / vms_guest / net_device / pod_container
pam_session.relay_agent_id ──► bot_agent (BOT)
pam_gateway ──(native SSH)──► pam_grant ──► pam_session
pam_login_acl ──(filter login bastion)
pam_apikey ──► app_user (user_id)
pam_ticket_provider ──► pam_access_request (ticket integration)
pam_discovery_job ──► pam_asset / pam_account
```

> `pam_command`/`pam_session` = telemetry audit (retensi sedang/panjang);
> `pam_asset`/`pam_account`/`pam_policy`/`pam_grant`/`pam_command_filter` =
> persisten. `pam_account` menyimpan rahasia **terenkripsi**.

## 6. Backend (osc_rest) & Agen

Struktur: `osc_rest/skeleton/pam/` (`pam_handler.go`, `pam_usecase.go`,
`pam_repository.go`, `pam_template.go`) + `mechanic/pam/` (SSH gateway,
command filter, recording, `guacd` client, login ACL, command-log store adapter) + agen **`osc_auto/agent_vm`**
(capability `pam`).

### 6.1 Endpoint UI (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("PAM", level)`)

| Area | Endpoint |
|---|---|
| Dashboard | `GET /rest/pages/PAM/overview` (sesi aktif, akses, alert perintah) |
| Assets | `GET/POST /PAM/assets`, `GET/PUT/DELETE /PAM/assets/:id`, `POST /PAM/assets/:id/ping`, `POST /PAM/assets/import` (CSV/Excel), `GET /PAM/assets/export` |
| Accounts | `GET/POST /PAM/accounts`, `GET/PUT/DELETE /PAM/accounts/:id`, `POST /PAM/accounts/:id/rotate`, `GET/POST /PAM/account-templates`, `POST /PAM/accounts/import`, `GET /PAM/accounts/export`, `POST /PAM/discovery-jobs` |
| Policies | `GET/POST /PAM/policies`, `PUT/DELETE /PAM/policies/:id` |
| Grants | `GET/POST /PAM/grants`, `DELETE /PAM/grants/:id` |
| Filters | `GET/POST /PAM/filters`, `GET/POST /PAM/filter-bindings`, `PUT/DELETE /PAM/filters/:id` |
| Connect | `GET /PAM/connect?reason=` (WebSocket terminal SSH/SFTP/RDP/VNC), `POST /PAM/sessions/share` (buat share link), `GET /PAM/sessions/shared/:token` (akses via share) |
| Gateway native | `GET/POST /PAM/gateways`, `PUT/DELETE /PAM/gateways/:id`, `POST /PAM/gateways/:id/restart` |
| Sessions | `GET /PAM/sessions`, `GET /PAM/sessions/:id`, `POST /PAM/sessions/:id/terminate`, `GET /PAM/sessions/:id/replay` |
| Live | `GET /PAM/sessions/live` (monitor), `GET /PAM/sessions/:id/shadow` (WS read-only) |
| Requests | `GET/POST /PAM/requests`, `POST /PAM/requests/:id/approve\|reject`, `GET/POST /PAM/approval-flows`, `GET/POST /PAM/ticket-providers` |
| Commands | `GET /PAM/commands`, `POST /PAM/commands/:id/approve` (bila `require_approval`) |
| Settings | `GET/PUT /PAM/settings` (rekam on/off, retensi, timeout, kredensial, lockout, MFA methods, clipboard, session caps), `GET/POST/PUT/DELETE /PAM/login-acls`, `GET/POST /PAM/apikeys`, `DELETE /PAM/apikeys/:id` |
| Health | `GET /PAM/health` (gateway/guacd/storage/elastic) — component health check/status page |

### 6.2 Mekanisme koneksi (safe & audit)

1. UI minta `GET /PAM/connect?asset=&account=&protocol=` → cek `pam_grant` +
   `pam_policy` (waktu, protokol, approval), **login/session ACL**, caps (concurrent/single-device).
2. Bila perlu approval → buat `pam_access_request` (mendukung multi-level approval dan external ticket system/webhook); tunggu keputusan.
3. Backend membuka koneksi ke target (langsung atau via agen relay; dukung **native RDP client** path terpisah), memakai
   rahasia dari vault (tidak dikirim ke browser). Dukungan akses via **session share link** (token terbatas) bila diizinkan.
4. Setiap perintah SSH lewat **command filter** (binding user×asset×account dengan priority) → `pam_command`; sesi direkam. Command-log ditulis via **pluggable store** (Local/Null/Elasticsearch).
5. Selesai → simpan `recording_path`/statistik di `pam_session` (termasuk `last_active_at`, `clipboard_enabled`, share info jika ada).
6. **MFA & reason:** bila policy `require_mfa`/`require_reason`, verifikasi MFA (TOTP/WebAuthn/Passkey/RADIUS)
   dan alasan wajib sebelum sesi dibuat (`mfa_verified`, `mfa_method`, `reason`).
7. **SSH gateway native:** `ssh <user>@<bastion>:<port>` → auth user bastion (melewati Login ACL + failed-login lockout) →
   MFA/reason → petakan ke `pam_grant`/`pam_policy` → proxy ke target; semua
   lewat command filter + rekaman yang sama. Akses otomatisasi dapat menggunakan **API keys/PAT** dengan scope terbatas.
8. **Clipboard control:** enforce clipboard per arah (local↔remote) sesuai policy saat sesi RDP/VNC aktif.
9. **Timeouts & expiry:** sesi diakhiri berdasar `idle_timeout` terpisah dari `max_session_min`; dapat di-expire saat browser close bila diatur policy.
10. **Login ACL (MAJOR):** setiap upaya login ke bastion (gateway/UI) dicek `pam_login_acl` (allow/deny, IP/time window), serta dicatat lockout (`pam_lockout`) untuk failed-login user/IP.

### 6.3 Endpoint agen (`/rest/agent`, `USBots()`, token `bot_agent` + mTLS)

| Endpoint agen | Fungsi |
|---|---|
| `GET /rest/agent/pam/ws` | Kanal relay koneksi (SSH/RDP/VNC/Telnet) untuk segmen terisolasi. |
| `POST /rest/agent/pam/exec` | Terminal terstruktur (buka/tutup/stream) dengan token sesi. |
| `GET  /rest/agent/pam/recording` | Unggah/sinkron rekaman sesi (bila relay). |
| `POST /rest/agent/pam/heartbeat` | Denyut + status relay (`bot_heartbeat`). |
| `GET  /rest/agent/pam/health` | Health check dari agen (relay status) untuk component health aggregation. |

> Semua lewat grup `/rest/agent` (`USBots()`); agen **tidak** mengakses DB.
> Rahasia dikirim per-sesi terenkripsi (kanal mTLS).

## 7. Frontend (osc_site)

| Kode | Halaman |
|---|---|
| `PAM01` | **Dashboard** — sesi aktif, permintaan pending, alert perintah, tren akses, health status |
| `PAM02` | **Assets** — daftar target (server/VM/network/container), uji, tautan modul, bulk import/export |
| `PAM03` | **Accounts** — vault kredensial (tanpa reveal), status rotasi, account templates, discovery |
| `PAM04` | **Policies & Grants** — kebijakan + hibah akses per user/aset, clipboard control, MFA methods, caps |
| `PAM05` | **Live Sessions** — monitor/shadow/terminate sesi berjalan, session share/invite |
| `PAM06` | **Sessions** — riwayat + **replay** (asciicast/grafis) + unduhan, native RDP connect info |
| `PAM07` | **Command Filters** — regex block/alert/approve + binding granularity (user×asset×account) |
| `PAM08` | **Requests** — permintaan akses + approval, multi-level approval, external ticket providers |
| `PAM09` | **Settings** — perekaman, retensi, timeout (idle/max), keamanan, lockout, API keys/PAT, pluggable command-log store |
| `PAM10` | **Gateway & Security** — SSH gateway native, host key, MFA/watermark/rotasi, **Login ACL (MAJOR)**, health check/status page |
| `PAM11` | **Health & Ops** (opsional) — component health (gateway/guacd/storage), discovery jobs, audit lockout |

**Reuse:** `@/uix/datatable`, `@/lib/grid`, `/proxy/pages/*`, **`@xterm/xterm`**
+ `@xterm/addon-fit` + `src/uix/web-terminal.tsx` (terminal), `src/lib/ws.ts`
(`useSocket`), pola `mechanic/sshproxy.go`; **noVNC** (VNC, reuse `VMS`);
pemutar **asciicast** (`asciinema-player` — aset baru).

## 8. Keamanan & RBAC

- **Vault:** rahasia terenkripsi (`mechanic.crypto`), **tanpa** endpoint reveal;
  rotasi opsional; akses tulis kredensial `POST` + audit.
- **RBAC per-aset:** `pam_grant` + `pam_policy` (protokol/aksi/time window);
  dicek saat connect, bukan hanya di UI.
- **Perekaman & live monitor:** tamper-evident (hash rekaman); akses replay
  `VIEW`, terminate `POST`.
- **Command filter:** blokir perintah berbahaya; approval untuk yang berisiko.
- **Least privilege relay:** agen hanya membuka koneksi ke target yang
  diizinkan; token sesi berumur pendek.
- **Isolasi tenant:** semua query difilter `company_id`.
- **Audit:** `pam_session`/`pam_command` + `USLogs` (`app_user_action`).

### 8.1 Otorisasi
- Baca: `VIEW`; connect/kelola aset/akun/policy: `POST`; hapus & approval:
  `BOOK`/`APP04`.

## 9. Retensi & Audit

- `pam_command` → purge via `retention.go` (mis. 180 hari, `RE_DAYS_PAM_COMMAND`). Penyimpanan dapat dialihkan ke **pluggable command-log store** (Local/Null/Elasticsearch).
- `pam_session` → metadata panjang (mis. 365 hari); **rekaman** sesuai `settings`
  (mis. 90–365 hari), disimpan di disk/objek.
- `pam_access_request` + `pam_access_request_approval` + `pam_approval_flow`/`pam_approval_step` → audit (persisten).
- `pam_asset`/`pam_account`/`pam_account_template`/`pam_policy`/`pam_grant`/`pam_command_filter`/`pam_command_filter_binding`/`pam_gateway`/`pam_login_acl`/`pam_apikey`/`pam_ticket_provider`/`pam_discovery_job`/`pam_health_check`/`pam_lockout` →
  persisten sesuai kebutuhan.
- Semua mutasi UI → `USLogs` (`app_user_action`). Login ACL, lockout, share session, API keys, bulk import/export, ticket integration, dan health events juga diaudit.

## 10. Integrasi Lintas-Modul

- **AMM** ([app_amm.md](app_amm.md)) — `pam_asset` menautkan ke `amm_asset`
  (target = aset terinventaris).
- **VMS** ([app_vms.md](app_vms.md)) — target VM (`vms_guest`), console terpadu.
- **NET** ([app_net.md](app_net.md)) — target perangkat MikroTik (SSH/API).
- **POD** ([app_pod.md](app_pod.md)) — exec container (opsional) & target.
- **SEC** ([app_sec.md](app_sec.md)) — event sesi/command sebagai sinyal SIEM;
  user/command berisiko → alert.
- **APP04** — approval akses/command berisiko; **BOT** — relai agen.
- **OBS** — notifikasi (`obs_notification`) & metrik sesi.

## 11. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Model, vault, SSH** | Model `pam_*` + migrasi (termasuk template, login_acl, lockout, apikey, health, ticket_provider, discovery, approval flow); vault kredensial (+ SSH key); gateway **SSH** via WS; `pam_session`/`pam_command` (abstraksi store); halaman `PAM02`–`PAM03`, `PAM06`. |
| **B. RBAC & policy** | `pam_policy`/`pam_grant`/time window; command filter + **binding user×asset×account** (priority); halaman `PAM04`, `PAM07`. |
| **C. Live & recording** | Live monitor/shadow/terminate; replay asciicast; **idle timeout** terpisah; **session share/invite**; halaman `PAM01`, `PAM05`. |
| **D. SFTP & approval** | SFTP (upload/download terkendali); access request + approval (`APP04`); **multi-level approval**; **external ticket-system integration**; halaman `PAM08`. |
| **E. RDP/VNC** | Integrasi `guacd` (atau noVNC untuk VNC); rekaman grafis; **clipboard control** (per arah); **native RDP client connect method** (mstsc gateway path). |
| **F. Polish & keamanan** | Rotasi kredensial, MFA (TOTP/WebAuthn/Passkey/RADIUS), **session caps** (login-failure lockout + single-device/concurrent-session), **session expiry on browser close**, hash rekaman, **bulk import/export**, **account discovery/collection**, test & dokumentasi. |
| **F2. Gateway & hardening** | **SSH gateway native** (`pam_gateway`), **Login ACL to bastion itself (MAJOR)** (`pam_login_acl`), **API keys/PAT**, **pluggable command-log store** (Local/Null/Elasticsearch), **watermark** sesi grafis, **reason wajib**, **component health check/status page**, halaman `PAM09`–`PAM11`. |
| **F3. Telnet (opsional)** | Evaluasi **Telnet** (lihat §13) — tambahkan dukungan hanya bila diperlukan; perbarui protokol, endpoint agen, filter & rekaman. |

## 12. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Kebocoran kredensial vault | Enkripsi, tanpa reveal, akses `POST`+audit, rotasi. |
| Penyalahgunaan akses istimewa | RBAC per-aset, time window, approval, perekaman. |
| Rekaman dihapus/diubah | Tamper-evident (hash) + retensi + akses terbatas. |
| Banjir sesi/perintah | Batas sesi per user, timeout, rate-limit. |
| Relay terkompromi | Token sesi pendek + mTLS; allowlist target; audit. |
| Ketidakcocokan protokol | Dev bertahap (SSH dulu), uji per protokol. |

## 13. Non-Goals & Keputusan Protokol

- **SSO/OIDC** menyusul (selaras auth OmniSight); **MFA per koneksi** (TOTP/WebAuthn/Passkey/RADIUS) termasuk (lihat §3.13).
- Proxy **DB/K8s/Web** eksotis & protokol vendor (menyusul).
- Integrasi **HSM**/secret manager eksternal (Vault) — menyusul.
- Menggantikan engine **guacd** (dipakai apa adanya bila RDP/VNC diaktifkan).
- **Telnet**: saat ini **tidak diaktifkan secara default** (fase awal difokuskan SSH(+SFTP), RDP/VNC). Dukungan Telnet dapat dipertimbangkan sebagai opsional jika diperlukan kasus penggunaan legacy; keputusan akhir: perlu konfirmasi eksplisit (§14.2). Jika disetujui, tambahkan ke protokol (`pam_asset.protocol`), relay agen, command logging, dan perekaman sesuai batasan protokol (plaintext).

## 14. Keputusan

### 14.1 Terkonfirmasi
- [x] Modul **`PAM`** (Bastion/PAM, ala JumpServer) ditambahkan; cluster `pam_*`.
- [x] Proxy engine di **`osc_rest`** (`mechanic/pam/`), agen = **relay**
  (capability `pam`); agen tidak akses DB.
- [x] **Vault terenkripsi**, tanpa reveal kredensial.
- [x] **SSH gateway native** (`pam_gateway`, `ssh user@bastion`).
- [x] **MFA per koneksi** (TOTP/WebAuthn/Passkey/RADIUS) & **watermark** sesi grafis.
- [x] **Reason wajib** saat connect (`pam_policy.require_reason`).
- [x] **Rotasi kredensial** (`pam_account.auto_rotate`) + jadwal.
- [x] **Login ACL to the bastion itself (MAJOR)** — IP whitelist/blacklist, login time window, failed-login user/IP lockout (`pam_login_acl` + `pam_lockout`).
- [x] **Clipboard control untuk RDP/VNC (MAJOR)** — per arah, per policy.

### 14.2 Perlu konfirmasi
- [ ] Protokol fase awal: **SSH(+SFTP) dulu**, RDP/VNC fase E — setuju? Termasuk **Telnet** (opsional/eksplisit)?
- [ ] RDP/VNC via **`guacd`** (add-on) atau cukup **noVNC** untuk VNC? Serta **native RDP client (mstsc)** sebagai jalur opsional?
- [ ] Approval akses/command via **`APP04`/`BOOK`**? Termasuk **multi-level approval** (N-of-M/staged)?
- [ ] **Pluggable command-log store**: default **Local**; perlu dukungan **Elasticsearch** sejak fase awal?
- [ ] **Session share/invite** — aktifkan secara default atau opsional (policy-based)?
- [ ] **External ticket-system integration** — prioritas vs internal approval flow?
- [ ] **Idle timeout vs max online time** — nilai default per policy? 
- [ ] **Single-device/concurrent-session cap & login-failure lockout** — nilai default (strict/lenient)?
- [ ] **Account discovery/collection** — dijalankan manual atau sebagai scheduled job?

## 15. Referensi Internal (aset yang bisa dipakai ulang)

- WebSocket proxy pola: `osc_rest/mechanic/sshproxy.go`.
- Route & grup: `osc_rest/backbone/routes.go` (`pages`, `admin`, `agent`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Enkripsi nilai sensitif: `mechanic/crypto`.
- Retensi: `osc_rest/backbone/retention.go`.
- Terminal UI: `@xterm/xterm`, `@xterm/addon-fit`, `src/uix/web-terminal.tsx`,
  `src/lib/ws.ts`.
- Agen per-VM: **`osc_auto/agent_vm`** (capability `pam`; backend = penghubung DB).
- Konvensi cluster DB: `osc_base/prisma/schema/cluster_pam.prisma`,
  [database/cluster_pam.md](../database/cluster_pam.md).
- Referensi eksternal: JumpServer, Teleport, Apache Guacamole.

**Perubahan (laporan):** 18 gap terintegrasi termasuk 2 **MAJOR**. Lihat: §1 (ruang lingkup diperluas), §2 (parity table), §3 (keputusan arsitektur), §5 (model DB + relasi), §6 (endpoint/UI + mekanisme), §7 (halaman), §9 (retensi/audit), §11 (roadmap), §13 (Telnet/non-goals), §14 (keputusan).
