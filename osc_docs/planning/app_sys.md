# Planning `APP06`–`APP11` — Lanjutan Admin (Notifikasi, Integrasi, API, Audit, Preferensi, Backup)

> Rencana **modul admin lanjutan** untuk rentang `APP06`–`APP11` (Fase 6).
> Melengkapi core platform [`APP00`–`APP05`](modules/README.md) dengan layanan
> lintas-modul: **notifikasi & template**, **integrasi (HRIS/SSO)**, **API key &
> webhook**, **audit & pelaporan**, **preferensi/branding**, dan **backup &
> pemulihan**. Bagian dari [Planning](README.md) · Lihat juga
> [blueprint](blueprint.md), [roadmap](roadmap.md), [checklist](checklist.md).
> ⚠️ Kode & model final ditetapkan saat aplikasi mulai dikerjakan — daftar di
> bawah adalah **usulan** (roadmap Fase 6).

## 1. Tujuan & Lingkup

Menyediakan **layanan administrasi bersama** yang dipakai seluruh modul, tanpa
menduplikasi logika di setiap modul:

| Kode | Modul | Cakupan inti |
|---|---|---|
| `APP06` | **Notification & Template** | Kanal notifikasi (email/SMTP, webhook, Telegram/Slack), template pesan, aturan routing per event/level. |
| `APP07` | **Integration Hub (HRIS/SSO)** | Sinkronisasi HRIS (karyawan/jabatan/area), SSO/OIDC/LDAP, pemetaan ke `app_user`. |
| `APP08` | **API Key & Webhook** | Kunci API programatik (service), langganan webhook keluar + log pengiriman/retry. |
| `APP09` | **Audit & Report** | Penampil audit (`app_user_action`), laporan aktivitas/ekspor, report tersimpan. |
| `APP10` | **Preference & Branding** | Preferensi UI per-user + pengaturan per-company (tema, logo, lokalisasi, default). |
| `APP11` | **Backup & Restore** | Backup konfigurasi/metadata (export/import), jadwal via `JMS`, restore dengan dry-run. |

Prinsip: **satu layanan bersama** (single source) — modul lain (OBS/JMS/SEC/PAM/
AMM/WEB) memanggil layanan ini alih-alih membangun kanal/template sendiri.

## 2. Referensi Fitur

| Area | Referensi umum | Target |
|---|---|---|
| Notifikasi & template | Grafana alerting, n8n, Laravel Notifications | ✅ `APP06` |
| Integrasi HRIS/SSO | Keycloak, Authentik, Google Workspace | ✅ `APP07` |
| API key & webhook | GitHub/GitLab PAT, Stripe webhooks | ✅ `APP08` |
| Audit & report | GLPI logs, Grafana reports | ✅ `APP09` |
| Preferensi/branding | White-label SaaS | ✅ `APP10` |
| Backup/restore | `pg_dump`, Vaultwarden export | ✅ `APP11` |

## 3. Keputusan Arsitektur (usulan — perlu konfirmasi §14)

1. **Kode modul:** `APP06`..`APP11` (satu grup admin lanjutan), halaman
   `APP06`..`APP11`.
2. **Cluster DB:** tetap **`app_*`** (`cluster_app.prisma`) — model baru
   memakai prefix `app_*` (mis. `app_notify_channel`, `app_api_key`).
3. **Notifikasi terpusat:** `APP06` menyediakan **dispatcher**; modul lain
   (OBS/JMS/SEC/PAM/AMM) mengirim event ke dispatcher, bukan mengirim sendiri.
4. **Backend-only secret:** kredensial SMTP, kunci API, kredensial integrasi,
   secret webhook → **terenkripsi** (`*_enc`), tidak ada endpoint reveal.
5. **Webhook keluar** memakai **HMAC signature** + **retry backoff** +
   delivery log (idempoten via `event_id`).
6. **SSO/OIDC opsional** (flag per-company); login lokal tetap default.
7. **Audit** memakai sumber yang sudah ada (`app_user_action` via `USLogs`);
   `APP09` = **penampil + pelaporan**, bukan tabel audit baru.
8. **Backup `APP11` = konfigurasi/metadata**, bukan dump penuh PostgreSQL
   (dump DB tetap tanggung jawab operasi/DB). Restore wajib **dry-run** +
   konfirmasi.
9. **Penjadwalan** tugas berkala (backup, sync HRIS) memakai **`JMS`**.

## 4. Arsitektur & Topologi

```
                    ┌──────────────────────────────────────────┐
                    │            osc_rest (:37772)              │
   Browser ─/proxy─►│  APP06 dispatcher  APP08 api/webhook      │
                    │  APP07 integration  APP09 audit/report     │
                    │  APP10 pref/branding APP11 backup          │
                    └───────┬───────────────┬───────────────────┘
                            │pgx            │outbound
                            ▼               ▼
                   PostgreSQL (app_*)   SMTP · Telegram/Slack · webhook target
                            ▲
                            │ (event)               APP07 ◄── HRIS / IdP (OIDC)
        OBS · JMS · SEC · PAM · AMM · WEB ──► APP06 (notify)
                            ▲
                     JMS (jadwal) ──► APP11 (backup) · APP07 (sync HRIS)
```

- Semua modul memanggil **APP06** sebagai satu-satunya pengirim notifikasi.
- **APP07** menarik data HRIS/IdP; hasil dipetakan ke `app_user`/`app_company_area`.
- **APP11** menulis berkas backup **backend-only** (`/root/backups/`).

## 5. Model Database — cluster `app_*` (usulan)

| Kode | Model | Isi pokok | Kunci |
|---|---|---|---|
| APP06 | `app_notify_channel` | Kanal: `type` (EMAIL/WEBHOOK/TELEGRAM/SLACK), `name`, `config_enc`, `is_active`, `company_id`? | `@@unique([company_id, name])` |
| APP06 | `app_notify_template` | Template: `code`, `channel_type`?, `subject`, `body`, `format` (TEXT/HTML/MARKDOWN), `locale` | `@@unique([company_id, code, locale])` |
| APP06 | `app_notify_rule` | Aturan: `event` (mis. `SEC_INCIDENT`, `OBS_ALERT`, `PAM_ACCESS_REQUEST`), `min_level`, `channel_id`, `template_id`, `is_active` | indeks `[company_id, event]` |
| APP06 | `app_notify_message` | Log kirim: `rule_id`?, `channel_id`, `event`, `target`, `status` (QUEUED/SENT/FAILED), `error`?, `sent_at` | indeks `[created_at]` (retensi) |
| APP07 | `app_integration` | Integrasi: `type` (HRIS/OIDC/LDAP), `name`, `config_enc`, `is_active`, `sync_mode` (PULL/PUSH) | `@@unique([company_id, name])` |
| APP07 | `app_integration_sync` | Riwayat sinkronisasi: `integration_id`, `started_at`, `finished_at`?, `status`, `created/updated/skipped`, `log`? | indeks `[integration_id, started_at]` |
| APP07 | `app_employee` | Data HRIS mentah/terpetakan: `external_id`, `name`, `email`, `position`?, `area_external_id`?, `user_id`? (→`app_user`) | `@@unique([company_id, external_id])` |
| APP08 | `app_api_key` | Kunci API: `name`, `prefix`, `hash`, `scopes` (Json), `user_id`?/`company_id`?, `last_used_at`?, `expires_at`?, `is_active` | `@@unique([prefix])` |
| APP08 | `app_webhook` | Langganan: `url`, `secret_enc`, `events` (Json), `is_active`, `company_id`? | indeks `[company_id]` |
| APP08 | `app_webhook_delivery` | Pengiriman: `webhook_id`, `event`, `event_id`, `status`, `http_status`?, `attempt`, `error`?, `delivered_at`? | `@@unique([webhook_id, event_id])` |
| APP09 | `app_report` | Report tersimpan: `code`, `name`, `source` (AUDIT/ASSET/SESSION/…), `params` (Json), `format`, `schedule_id`? (→`JMS`) | `@@unique([company_id, code])` |
| APP10 | `app_preference` | Preferensi user: `user_id`, `key`, `value` (Json) | `@@unique([user_id, key])` |
| APP10 | `app_company_setting` | Setting company: `company_id`, `key`, `value` (Json) | `@@unique([company_id, key])` |
| APP11 | `app_backup` | Backup: `name`, `scope` (CONFIG/METADATA), `path`, `size`, `checksum`, `status`, `schedule_id`? (→`JMS`), `created_at` | indeks `[created_at]` |
| APP11 | `app_backup_item` | Isi backup: `backup_id`, `cluster`, `model`, `row_count`, `checksum` | indeks `[backup_id, cluster]` |

Relasi inti:

```text
app_notify_rule ──► app_notify_channel · app_notify_template
app_notify_message ──► app_notify_rule/channel
app_integration (1) ──► (N) app_integration_sync
app_employee ──(opsional)──► app_user · app_company_area
app_webhook (1) ──► (N) app_webhook_delivery
app_api_key ──(opsional)──► app_user / app_company
app_report.schedule_id ──► jms_job (JMS)
app_backup (1) ──► (N) app_backup_item ; app_backup.schedule_id ──► jms_job
```

> `app_notify_message` & `app_webhook_delivery` = **telemetri ber-retensi**
> (lihat `retention.go`). Sisanya **persisten** (konfigurasi/referensi).
> Kredensial/kunci/secret → kolom `*_enc` (**terenkripsi**).

## 6. Backend (osc_rest)

Struktur: `osc_rest/skeleton/app/appNN/` (mengikuti pola `APP01`–`APP05`:
`handler`, `usecase`, `repository`, `template`) + layanan lintas: mis.
`mechanic/notify/` (dispatcher APP06), `mechanic/webhook/` (HMAC/retry APP08).

### 6.1 Endpoint UI (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("APPNN", level)`)

| Kode | Area | Endpoint |
|---|---|---|
| `APP06` | Channels | `GET/POST /APP06/channels`, `PUT/DELETE /APP06/channels/:id`, `POST /APP06/channels/:id/test` |
| `APP06` | Templates | `GET/POST /APP06/templates`, `PUT/DELETE /APP06/templates/:id` |
| `APP06` | Rules | `GET/POST /APP06/rules`, `PUT/DELETE /APP06/rules/:id` |
| `APP06` | Log | `GET /APP06/messages`, `POST /APP06/messages/:id/retry` |
| `APP07` | Integrations | `GET/POST /APP07/integrations`, `PUT/DELETE /APP07/integrations/:id`, `POST /APP07/integrations/:id/sync` |
| `APP07` | SSO | `GET/PUT /APP07/sso`, `POST /APP07/sso/test` |
| `APP07` | Employees | `GET /APP07/employees`, `POST /APP07/employees/:id/link` |
| `APP08` | API keys | `GET/POST /APP08/keys`, `DELETE /APP08/keys/:id`, `POST /APP08/keys/:id/revoke` |
| `APP08` | Webhooks | `GET/POST /APP08/webhooks`, `PUT/DELETE /APP08/webhooks/:id`, `POST /APP08/webhooks/:id/test` |
| `APP08` | Deliveries | `GET /APP08/deliveries`, `POST /APP08/deliveries/:id/redeliver` |
| `APP09` | Audit | `GET /APP09/audit` (filter modul/user/aksi/tanggal), `GET /APP09/audit/:id` |
| `APP09` | Reports | `GET/POST /APP09/reports`, `PUT/DELETE /APP09/reports/:id`, `GET /APP09/reports/:id/run`, `GET /APP09/reports/:id/export` |
| `APP10` | Preferences | `GET/PUT /APP10/preferences` (self-service, grup `auths`) |
| `APP10` | Company settings | `GET/PUT /APP10/settings`, `POST /APP10/settings/logo` |
| `APP11` | Backup | `GET/POST /APP11/backups`, `GET /APP11/backups/:id`, `POST /APP11/backups/:id/restore` (dry-run default), `DELETE /APP11/backups/:id` |

### 6.2 Endpoint agen / programatik
- `APP08` — API key dipakai klien eksternal ke endpoint `/rest/api/*` (scope);
  bukan untuk agen (agen tetap `bot_agent` via `USBots()`).
- `APP06` — dispatcher dipakai internal; tidak diekspos ke publik.

### 6.3 Layanan lintas-modul (dipakai modul lain)
- `mechanic/notify` — `Notify(event, level, payload, target?)`; dipanggil OBS,
  JMS, SEC, PAM, AMM, WEB.
- `mechanic/webhook` — kirim keluar + retry + HMAC.

## 7. Frontend (osc_site)

| Kode | Halaman | Isi |
|---|---|---|
| `APP06` | **Notification** | tab: Channels, Templates, Rules, Message Log (test kirim, retry) |
| `APP07` | **Integration** | tab: Integrations, SSO/OIDC, HRIS Sync, Employees (link ke user) |
| `APP08` | **API & Webhook** | tab: API Keys (buat/revoke, scopes), Webhooks, Deliveries |
| `APP09` | **Audit & Report** | Audit log (filter, detail), Reports (run/export, jadwal) |
| `APP10` | **Preferences & Branding** | preferensi user (self), setting company (tema/logo/locale/default) |
| `APP11` | **Backup & Restore** | daftar backup, buat/unduh, restore (dry-run + konfirmasi), jadwal |

**Reuse:** `@/uix/datatable`, `@/lib/grid`, pola tab (`APP02`/`APP04`), editor
template (`@codemirror`), `recharts` (statistik audit), `jspdf`/`docx` (ekspor).

## 8. Keamanan & RBAC

- **Semua secret terenkripsi** (`config_enc`/`secret_enc`/`hash`); kunci API
  disimpan **hash** (hanya `prefix` yang terlihat + ditampilkan sekali saat dibuat).
- **API key scopes** membatasi akses; revoke seketika; `expires_at` opsional.
- **Webhook keluar** ditandatangani **HMAC**; target https-only + allowlist.
- **SSO/OIDC**: verifikasi `id_token`/nonce/state; mapping grup→company/role.
- **Audit**: `APP06`/`APP08` mencatat perubahan kanal/kunci/webhook; retry/restore dicatat.
- **Restore `APP11`** wajib `POST` (admin bypass) + **dry-run** + konfirmasi ganda.
- **Isolasi tenant:** semua query difilter `company_id` (kecuali global admin).
- Baca `VIEW`, mutasi `POST`; API key & restore khusus `POST`/admin.

## 9. Retensi & Audit

- **Ber-retensi:** `app_notify_message`, `app_webhook_delivery`,
  `app_integration_sync` → purge via `retention.go`.
- **Persisten:** channel/template/rule/integration/api_key/webhook/preference/
  setting/backup + item (konfigurasi).
- Berkas backup (`/root/backups/`) dirotasi (retensi jumlah/umur).
- Semua mutasi UI → `USLogs` (`app_user_action`); `APP09` membacanya.

## 10. Integrasi Lintas-Modul

- **Semua modul → `APP06`** untuk notifikasi (OBS alert, JMS job gagal, SEC
  insiden, PAM akses/approval, AMM warranty, WEB cert expiry).
- **`APP07` ← HRIS/IdP**; hasil sync mempengaruhi `app_user`/`app_company_area`.
- **`APP08`** — webhook keluar untuk event lintas-modul; API key untuk integrasi.
- **`APP09` ← `app_user_action`** (audit) + sumber modul untuk laporan.
- **`APP10`** — dipakai shell UI (branding, locale).
- **`APP11` + `JMS`** — backup terjadwal; `APP07` sync terjadwal via `JMS`.
- **`BOT`** — pengiriman notifikasi/webhook dapat memakai agen (opsional).

## 11. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Notifikasi (`APP06`)** | Dispatcher + channel/template/rule + log; halaman `APP06`. |
| **B. API & Webhook (`APP08`)** | API key + webhook keluar + delivery/retry + HMAC; halaman `APP08`. |
| **C. Audit & Report (`APP09`)** | Penampil audit + report tersimpan/ekspor; halaman `APP09`. |
| **D. Preference/Branding (`APP10`)** | Preferensi user + setting company; dipakai shell UI; halaman `APP10`. |
| **E. Integrasi (`APP07`)** | HRIS sync + SSO/OIDC/LDAP; halaman `APP07`. |
| **F. Backup (`APP11`)** | Export/import konfigurasi + dry-run restore + jadwal `JMS`; halaman `APP11`. |

## 12. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Spam/notifikasi gagal | Rule + level + retry + log; dedup `event_id`. |
| Kebocoran secret (SMTP/API/webhook) | Enkripsi, hash API key, tampil sekali, revoke. |
| Webhook hilang | Retry backoff + delivery log + redeliver manual. |
| SSO salah map ke role | Dry-run mapping + konfirmasi + audit. |
| Restore merusak data | Dry-run default + konfirmasi ganda + backup sebelum restore. |
| Duplikasi notifikasi antar-modul | `APP06` satu-satunya dispatcher. |

## 13. Non-Goals

- **Full message bus/queue** (Kafka/RabbitMQ) — non-goal; cukup dispatcher + log.
- **Dump penuh PostgreSQL** — tanggung jawab ops/DB, bukan `APP11`.
- **Billing/HRIS penuh** — `APP07` hanya sinkronisasi.
- **Editor email WYSIWYG lanjutan** — template teks/HTML sederhana dulu.
- **SSO sebagai satu-satunya login** — login lokal tetap default.

## 14. Keputusan

### 14.1 Terkonfirmasi (arahan umum)
- [x] Fase 6 = **admin lanjutan** `APP06`–`APP11` (roadmap).
- [x] Terdiri dari: notifikasi/template, integrasi, API/webhook, audit/report,
      preferensi, backup.

### 14.2 Perlu konfirmasi
- [ ] Pemetaan final kode: `APP06` Notifikasi, `APP07` Integrasi, `APP08`
      API/Webhook, `APP09` Audit/Report, `APP10` Preferensi, `APP11` Backup?
- [ ] Kanal notifikasi prioritas (**email + webhook** dulu, Telegram/Slack menyusul)?
- [ ] **SSO/OIDC** termasuk Fase 6 atau ditunda (login lokal dulu)?
- [ ] HRIS: provider spesifik (mis. Google Workspace) atau generik **CSV/API**?
- [ ] `APP11` scope backup: **konfigurasi/metadata saja** (bukan dump DB)?
- [ ] Multi-tenant model baru (`company_id`) atau **global admin**?

## 15. Referensi Internal (dapat dipakai ulang)

- Pola modul admin: [modules/app05.md](modules/app05.md) dkk.
- Route & grup: `osc_rest/backbone/routes.go` (`admin`, `auths`, `guest`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Retensi: `osc_rest/backbone/retention.go`.
- Grid & pagination: `mechanic.GridParams`, `src/lib/grid.ts`.
- Penjadwalan: modul `JMS` ([app_amm.md](app_amm.md) pola pengingat, roadmap Fase 4).
- Cluster DB: `osc_base/prisma/schema/cluster_app.prisma`,
  [database/cluster_app.md](../database/cluster_app.md).
- Konvensi: [../development/conventions.md](../development/conventions.md).
