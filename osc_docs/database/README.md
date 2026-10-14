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
| `prisma/schema/cluster_pam.prisma` (rencana) | [cluster_pam.md](cluster_pam.md) | Bastion / Privileged Access (`pam_*`) |
| `prisma/schema/cluster_web.prisma` | [cluster_web.md](cluster_web.md) | Web/Proxy + Domain & DNS (`web_*`) |
| `prisma/schema/cluster_jms.prisma` | [cluster_jms.md](cluster_jms.md) | Job management (`jms_*`) |
| `prisma/schema/cluster_bot.prisma` | [cluster_bot.md](cluster_bot.md) | Bot/Agent (`bot_*`) |
| `prisma/schema/cluster_dso.prisma` | [cluster_dso.md](cluster_dso.md) | DevOps/CI-CD (`dso_*`) |
| `prisma/schema/cluster_obs.prisma` | [cluster_obs.md](cluster_obs.md) | Observability (`obs_*`) |
| `prisma/schema/cluster_doc.prisma` | [cluster_doc.md](cluster_doc.md) | Document (`doc_*`) |

Konvensi: satu file Prisma = satu dokumen detail; cluster baru menambah satu
file `cluster_<nama>.prisma` + satu dokumen `cluster_<nama>.md`.

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
  `doc_*` untuk cluster lain (sesuai daftar retensi
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
| `20261009022147_planned_clusters` | Cluster terencana: `amm`, `net`, `vms`, `pod`, `sec`, `web`, `jms`, `bot`, `dso`, `obs`, `doc`. |
| `20261009022856_complete_cluster_app` | FK `app_user_session.user_id` → `app_user` + indeks `parent_id`/`user_id`. |

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