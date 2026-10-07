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
| `prisma/schema/cluster_*.prisma` (mendatang) | `cluster_*.md` | Model per cluster (net/obs/sec/dso/dll.) |

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
- Prefix model: `app_*` untuk cluster aplikasi; `net_*`, `obs_*`, `sec_*`,
  `pod_*`, `jms_*`, `dso_*`, `web_*`, `vms_*`, `bot_*` untuk cluster lain
  (sesuai daftar retensi `osc_rest/backbone/retention.go`).

## 5. Manajemen Migrasi

```bash
cd osc_base
npx prisma migrate dev            # buat & terapkan migrasi dev
npx prisma migrate dev --name <nama>
npx prisma migrate deploy         # terapkan ke environment lain
npx prisma db seed                # seed admin + modul
```

Migrasi terakhir saat penulisan: `20261006024400_init` (membuat seluruh model
`cluster_app`).

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