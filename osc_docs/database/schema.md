# Osc_base — `prisma/schema/schema.prisma`

> Dokumen detail file `prisma/schema/schema.prisma` — inti generator & datasource.
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Isi File

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}
```

File ini **tidak berisi model** — hanya dua blok ini. Model disimpan per
cluster pada `cluster_*.prisma` lain atau file skema domain terpisah.

## 2. Generator

- `provider: "prisma-client-js"` → menghasilkan Prisma Client (TypeScript/Node).
- Dipakai oleh backend (`osc_rest`) maupun seed di `osc_base` lewat adapter
  `pg` (`@prisma/adapter-pg`).

## 3. Datasource

- `provider: "postgresql"`, tanpa atribut `url`.
- URL dibaca dari environment `DATABASE_URL` melalui `prisma.config.ts`
  (`env("DATABASE_URL")`).

Seluruh migrasi & client mengikuti datasource ini, sehingga tetap satu sumber
kebenaran database.

## 4. Interaksi

| File lain | Hubungan |
|---|---|
| `prisma/config.ts` | Mendefinisikan `schema: "prisma"` (folder berisi schema ini) + `datasource.url` |
| `cluster_*.prisma` | Berisi model; dikenali Prisma karena berada pada `schema` dir |
| `.env` | Menyediakan `DATABASE_URL` |

## 5. Modifikasi

- Ganti provider generator/datasource (jarang) → buat migrasi baru.
- Menambah model → buat di file `cluster_*.prisma`, bukan di sini, agar
  dokumentasi model tetap terpisah per file.