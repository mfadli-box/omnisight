# Osc_docs — Panduan Pengembangan & Penggunaan

> Pusat dokumentasi teknis, development guide, dan tooling untuk stack OmniSight.
> Untuk konfigurasi sensitif & rahasia, lihat direktori `osc_docs/config/`
> (tidak dibaca oleh asisten/opencode — lihat `opencode.json`).

## 1. Component Reference

- [Frontend — Next.js](frontend/README.md) — osc_site
- [Backend — Golang](backend/README.md) — osc_rest
- [Database — Prisma/Postgres](database/README.md) — osc_base

## 2. Panduan Utama

- [Menjalankan stack](development/run.md) — setup env, langkah menjalankan
  ketiga komponen + database.
- [Konvensi API & kode](development/conventions.md) — auth, error format,
  routing, pola endpoint.

## 3. Structure of osc_docs

```
osc_docs/
├── frontend/          # dokumen teknis osc_site
├── backend/           # dokumen teknis osc_rest
├── database/          # dokumen teknis osc_base
├── development/       # panduan pengembangan (run, konvensi)
├── config/            # rahasia & konfigurasi sensitif (dilindungi)
└── media/             # aset gambar/logo
```

## 4. Quick Links

| Task | Dokumen |
|---|---|
| Menjalankan DB + migrasi | [development/run.md](development/run.md) |
| Menjalankan backend & frontend dev | [development/run.md](development/run.md) |
| Memahami auth & error API | [development/conventions.md](development/conventions.md) |
| Menambah model database | [database/README.md](database/README.md) |
| Menambah endpoint backend | [backend/README.md](backend/README.md) |