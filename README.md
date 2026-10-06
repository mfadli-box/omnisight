# OmniSight

Platform DevSecOps berbasis monorepo: pengembangan (development), keamanan
(security), dan operasi (operations) dalam satu pipeline.

## Komponen

| Direktori | Peran | Stack |
|---|---|---|
| [`osc_site/`](osc_site/) | Frontend | Next.js (App Router, React 19, Tailwind 4) |
| [`osc_rest/`](osc_rest/) | Backend REST API | Golang (Gin, pgx) |
| [`osc_base/`](osc_base/) | Database layer | Prisma 7 + PostgreSQL |

## Alur

```text
[osc_site] (Next.js)
     │  /proxy/guest · /proxy/pages
     ▼
[osc_rest] (Golang REST API · :37772)
     │
     ▼
[osc_base] (Prisma ⇄ PostgreSQL · :37771)
```

- `osc_site` berkomunikasi dengan backend lewat server proxy (`/proxy/...`)
  agar token tidak bocor ke browser.
- `osc_rest` bertindak sebagai API tunggal di depan database.
- `osc_base` menjadi single source of truth skema data.

## Dokumentasi

Seluruh dokumentasi teknis & development guide tersentral di **[`osc_docs/`](osc_docs/)**:

- [Frontend — Next.js](osc_docs/frontend/README.md)
- [Backend — Golang](osc_docs/backend/README.md)
- [Database — Prisma/Postgres](osc_docs/database/README.md)
- [Menjalankan stack](osc_docs/development/run.md)
- [Konvensi API & kode](osc_docs/development/conventions.md)

## Mulai Cepat

1. Siapkan env sesuai `osc_docs/development/run.md`.
2. Jalankan database & migrasi (`docker compose up -d osc_base` + `npx prisma migrate dev`).
3. Jalankan backend (`go run .` di `osc_rest`).
4. Jalankan frontend (`npm run dev` di `osc_site`).

## Keamanan

- `.env`, `deploy/certs/*.pem|*.key`, dan `osc_docs/config/**` tidak pernah
  masuk git dan dilindungi (`opencode.json`).
- Lihat konvensi keamanan: [`osc_docs/development/conventions.md`](osc_docs/development/conventions.md).