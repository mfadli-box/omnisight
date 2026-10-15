# Osc_base — Database Layer (Database)

> Dokumentasi utama database layer OmniSight (Prisma + PostgreSQL).
> Dokumen ini berisi indeks & hal umum; **detail model dipecah per file
> Prisma** di bawah.

## 1. Peran

- Menyimpan seluruh data platform (API, telemetri, log, audit).
- Menjadi sumber kebenaran skema (single source of truth) via Prisma.
- Melayani `osc_rest` dengan koneksi pool `pgx` / adapter Prisma.

```
osc_base/
├── prisma/
│   ├── schema/
│   │   ├── schema.prisma          # generator + datasource (core)
│   │   └── cluster_*.prisma       # model per cluster (skema domain)
│   ├── migrations/                # riwayat migrasi SQL
│   └── seed.ts                    # seed data (admin + modul)
├── prisma.config.ts               # config Prisma (env DATABASE_URL)
├── pgbouncer.sh                   # init script database backup (via entrypoint)
├── package.json                   # dependensi & override keamanan
└── .env                           # DATABASE_URL dll. (tidak masuk git)
```

## 2. Indeks Dokumen per File Prisma

| File Prisma | Dokumen | Isi |
|---|---|---|
| `prisma/schema/schema.prisma` | [schema.md](schema.md) | Generator data client + datasource PostgreSQL |
| `prisma/schema/cluster_app.prisma` | [cluster_app.md](cluster_app.md) | Model multi-tenant aplikasi (`app_*`) |
| `prisma/schema/cluster_amm.prisma` | [cluster_amm.md](cluster_amm.md) | Asset management & CMDB (`amm_*`) |
| `prisma/schema/cluster_net.prisma` | [cluster_net.md](cluster_net.md) | Network monitoring (`net_*`) |
| `prisma/schema/cluster_vms.prisma` | [cluster_vms.md](cluster_vms.md) | VM & hypervisor management (`vms_*`) |
| `prisma/schema/cluster_pod.prisma` | [cluster_pod.md](cluster_pod.md) | Container/Pod (`pod_*`) |
| `prisma/schema/cluster_sec.prisma` | [cluster_sec.md](cluster_sec.md) | Keamanan perimeter/WAF + SIEM/HIDS (`sec_*`) |
| `prisma/schema/cluster_pam.prisma` | [cluster_pam.md](cluster_pam.md) | Bastion / Privileged Access (`pam_*`) |
| `prisma/schema/cluster_web.prisma` | [cluster_web.md](cluster_web.md) | Web/Proxy + Domain & DNS (`web_*`) |
| `prisma/schema/cluster_jms.prisma` | [cluster_jms.md](cluster_jms.md) | Job management (`jms_*`) |
| `prisma/schema/cluster_bot.prisma` | [cluster_bot.md](cluster_bot.md) | Bot/Agent (`bot_*`) |
| `prisma/schema/cluster_dso.prisma` | [cluster_dso.md](cluster_dso.md) | DevOps/CI-CD (`dso_*`) |
| `prisma/schema/cluster_obs.prisma` | [cluster_obs.md](cluster_obs.md) | Observability (`obs_*`) |
| `prisma/schema/cluster_doc.prisma` | [cluster_doc.md](cluster_doc.md) | Document & File Manager (`doc_*`) |
| `prisma/schema/cluster_chat.prisma` | [cluster_chat.md](cluster_chat.md) | Chat internal (`chat_*`) |
| `prisma/schema/cluster_mail.prisma` | [cluster_mail.md](cluster_mail.md) | Mail mandiri (`mail_*`) |

Konvensi: satu file Prisma = satu dokumen detail; cluster baru menambah satu
file `cluster_<nama>.prisma` + satu dokumen `cluster_<nama>.md`.

> **Cakupan saat ini:** 15 file `cluster_*.prisma` berisi **304 model** —
> seluruh perencanaan (fase 2–7) sudah diterjemahkan ke skema, termasuk field
> perluasan (`perluas`), tabel lanjutan (syscollector SEC, notify channel OBS,
> file manager `doc_*`, `chat_*`, `mail_*`, `app_announcement*`). Rincian per
> cluster ada di masing-masing dokumen.

## 3. Konfigurasi Umum

File: `prisma.config.ts`

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
```

Env wajib (`.env`, tidak di-git):

| Variabel | Contoh | Keterangan |
|---|---|---|
| `DATABASE_URL` | `postgresql://<user>:<pass>@localhost:<port>/osc?sslmode=disable&schema=public` | Koneksi PostgreSQL |
| `AD_MAIL` | — | Email admin hasil seed |
| `AD_PASS` | — | Password default admin (di-hash bcrypt saat seed) |

> Port pada `DATABASE_URL` harus sama dengan mapping container DB
> (lihat `docker-compose.yml`, saat ini `37771:5432`).

## 4. Konvensi Model

Setiap model pada semua cluster mengikuti aturan berikut:

```prisma
created_at  DateTime @default(now())
updated_at  DateTime @default(now())
```

- ID: `String @id @default(uuid())`.
- `is_active` untuk soft state (hindari hard-delete).
- Setiap model hanya menyimpan `created_at`/`updated_at` (tanpa `created_by`/`updated_by`).
- Unique: `@@unique` eksplisit (mis. `@@unique([code])`,
  `@@unique([company_id, code])`).
- Prefix model: `app_*` untuk cluster aplikasi; `amm_*`, `net_*`, `vms_*`,
  `pod_*`, `sec_*`, `pam_*`, `web_*`, `jms_*`, `bot_*`, `dso_*`, `obs_*`,
  `doc_*`, `chat_*`, `mail_*` untuk cluster lain (sesuai daftar retensi
  `osc_rest/backbone/retention.go`).

## 5. Manajemen Migrasi

```bash
cd osc_base
npx prisma migrate dev            # buat & terapkan migrasi dev
npx prisma migrate dev --name <nama>
npx prisma migrate deploy         # terapkan ke environment lain
npx prisma db seed                # seed admin + modul
```

Riwayat migrasi:

| Migrasi | Isi |
|---|---|
| `20261006024400_init` | Seluruh model `cluster_app`. |
| `20261009022147_planned_clusters` | Model awal cluster terencana: `amm`, `net`, `vms`, `pod`, `sec`, `web`, `jms`, `bot`, `dso`, `obs`, `doc`. |
| `20261009022856_complete_cluster_app` | FK `app_user_session.user_id` → `app_user` + indeks `parent_id`/`user_id`. |
| `20261014030000_cluster_pam` | Cluster `pam` (+ `pam_asset`, `pam_account`). |
| `20261014033120_cluster_pam` | Koreksi/penyesuaian cluster `pam`. |
| `20261014035328_cluster_app_extend` | Perluasan `app_*` (APP06–APP11: notifikasi, integrasi, api key/webhook, preferensi, report, backup). |
| `20261014040328_cluster_pod_extend` | Runtime `pod_*` (engine, stack, service, container, image, volume, network, …). |
| `20261014041828_cluster_net_extend` | Perluasan `net_*` (firewall, sensor, VLAN, IP, topologi, dll.). |
| `20261014041922_cluster_obs_extend` | Perluasan `obs_*` (system, disk, container, vm, check, alert rule, dll.). |
| `20261014042638_cluster_sec_extend` | Perluasan `sec_*` (SIEM/HIDS/XDR, FIM, SCA, vuln, intel, dll.). |
| `20261014042743_cluster_web_extend2` | Perluasan `web_*` (server, domain, DNS, access, stream, dll.). |
| `20261014042809_cluster_amm_extend` | Perluasan `amm_*` (CMDB, lisensi, fieldset, audit, consumable, kit, dll.). |
| `20261014060911_cluster_pod_extend2` | Perluasan lanjutan `pod_*` (registry, build, scan, template, git, dll.). |
| `20261014061652_cluster_net_extend2` | Perluasan lanjutan `net_*`. |
| `20261015020127_cluster_pam_extend` | Perluasan `pam_*` (grant, command filter, approval, ACL, lockout, dll.). |
| `20261015020201_cluster_sec_incident` | `sec_incident`/`sec_incident_event`. |
| `20261015020338_cluster_vms_snapshot` | `vms_snapshot` + perluasan VMS. |
| `20261015020738_extend_all_clusters_full_coverage` | Penutupan seluruh tabel cluster sesuai perencanaan penuh (paritas tool). |
| `20261015091606_extend_models_planned_fields` | Field perluasan model (`net_device` SNMP/mgmt, `vms_host`/`vms_guest`, `web_vhost`/`upstream`/`certificate`, `pod_*`, `amm_asset`/`amm_asset_request`, SEC rule DSL) + `obs_notify_channel` + `sec_syscollector_*`. |
| `20261015092316_cluster_chat_mail_file_news` | Cluster baru: File Manager (`doc_folder`, `doc_file`, `doc_file_version`, `doc_share`, `doc_quota`), Chat (`chat_*`), Mail (`mail_*`), Announcement/News (`app_announcement`, `app_announcement_read`). |

## 6. Seed

`prisma/seed.ts` (dijalankan via `tsx`):
- Admin: username `root`, email `AD_MAIL` (default `admin@localhost`),
  password `AD_PASS` (default `rahasia`, bcrypt salt 10) — di-`upsert`.
- Modul: `seedDatModule()` membaca array `moduleGroups` (kosong saat ini —
  diisi bertahap); group di-root (`parent_id: null`), halaman menunjuk ke group.
- Gunakan `upsert` agar idempoten — aman dijalankan ulang.
- Dipanggil `seedAdmin()` lalu `seedDatModule()`.

> **Penting (Prisma 7 + `prisma-client-js`):** setelah instalasi baru jalankan
> `npx prisma generate` agar client ter-generate (tidak otomatis).
> Import `PrismaClient` dari `@prisma/client` (bukan `@prisma/client/extension`
> — entry itu untuk generator `prisma-client` baru, dan `generate` legacy tidak
> menghasilkan file `extension.js`). `seed.ts` memakai `@prisma/adapter-pg`
> (`PrismaPg`) dengan pool `pg` dari `DATABASE_URL`.

## 7. Keamanan & Kepatuhan

- `.env`, `config/`, `deploy/certs/*.pem|*.key`, `pgbouncer.txt` diabaikan
  `.gitignore` — kredensial tidak pernah ke git.
- `package.json` memiliki blok `overrides` (deepmerge-ts, mysql2) sebagai
  remediasi audit dependensi; pertahankan `npm audit` di 0 sebelum deploy.
- Dukungan keamanan login: hash password, TOTP, lockout brute-force,
  revoke/block token, audit trail (rinci di [cluster_app.md](cluster_app.md)).
- Konfigurasi sensitif tambahan dilindungi di `osc_docs/config/**` (`opencode.json`).

## 8. Referensi

- [schema.md](schema.md) — generator & datasource
- [cluster_app.md](cluster_app.md) — model aplikasi multi-tenant
- Kelola container: [development/run.md](../development/run.md)
- Konvensi API (auth, header, error): [development/conventions.md](../development/conventions.md)