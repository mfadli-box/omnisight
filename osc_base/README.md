# osc_base

Fondasi **PostgreSQL + Prisma** untuk OmniSight.

- Prisma hanya dipakai untuk skema dan migrasi.
- ORM runtime tidak dipakai; backend Rust mengakses database memakai SQLx.
- WP-01 hanya menyediakan folder `prisma/`, `sql/`, dan validasi skema kosong.
- Belum ada tabel domain, RLS, seed, atau migrasi domain.
- Semua tabel, skema, indeks, RLS, dan seed dijelaskan di [dokumentasi database](../osc_docs/technical/database/README.md).

## Perintah

```bash
npm ci
DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/omnisight npm run validate
```

Jangan memakai `prisma db push`. Migrasi domain dibuat pada WP-02 dengan alur
expand-contract dan SQL manual untuk RLS, grant, trigger, serta constraint.

Status: scaffold WP-01.
