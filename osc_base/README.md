# osc_base

Fondasi **PostgreSQL + Prisma** untuk OmniSight.

- Prisma hanya dipakai untuk skema dan migrasi.
- ORM runtime tidak dipakai; backend Rust mengakses database memakai SQLx.
- WP-02 menyediakan skema fondasi `core`, `audit`, dan `platform`, migrasi SQL manual untuk constraint, RLS, grant, partisi, tenant integrity, dan hash chain audit, serta seed idempotent.
- Seed dua perusahaan sintetis menghasilkan 162 baris `core.role_permissions` per perusahaan (324 total), karena `post` mencakup `read` dan submodul sensitif memakai izin submodul sesuai `permissions.json`.
- Belum ada model domain aset, jaringan, monitoring, operasi, layanan, atau konten; model tersebut menyusul pada WP berikutnya.
- Semua tabel, skema, indeks, RLS, dan seed dijelaskan di [dokumentasi database](../osc_docs/technical/database/README.md).

## Perintah

```bash
npm ci
DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/omnisight npm run validate
./tests/run.sh
```

`tests/run.sh` menjalankan PostgreSQL ephemeral, menerapkan seluruh migrasi dari
database kosong, menjalankan seed dua kali, lalu menguji RLS, constraint, tenant
integrity, audit hash chain, akses langsung ke partisi, dan jumlah seed.

Jangan memakai `prisma db push`. Migrasi memakai alur expand-contract dan SQL
manual untuk RLS, grant, trigger, serta constraint.

## Struktur

| Path | Isi |
|---|---|
| `prisma/schema.prisma` | Salinan kontrak skema yang disetujui |
| `prisma/migrations/` | Migrasi Prisma berurutan |
| `prisma/seed.sql` | Seed idempotent dua perusahaan sintetis |
| `sql/` | SQL kanonik yang disalin ke migrasi |
| `tests/` | Tes database berbasis psql dan PostgreSQL ephemeral |

Status: WP-02 berjalan, belum selesai. Migrasi lokal dan tes lulus, termasuk migrasi P0 tenant integrity (`20261102000100_tenant_integrity`); migrasi staging, salinan data, serta keputusan ADR-015/016/017 masih tertunda.
