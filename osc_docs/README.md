# Osc_docs — Panduan Pengembangan & Penggunaan

> Pusat dokumentasi teknis, development guide, dan tooling untuk stack OmniSight.
> Untuk konfigurasi sensitif & rahasia, lihat direktori `osc_docs/config/`
> (tidak dibaca oleh asisten/opencode — lihat `opencode.json`).

## 1. Component Reference

- [Frontend — Next.js](frontend/README.md) — osc_site
- [Backend — Golang](backend/README.md) — osc_rest
- [Database — Prisma/Postgres](database/README.md) — osc_base
- Agent per-VM — `osc_auto/` (biner Go; lihat
  [blueprint §2](planning/blueprint.md#2-stack--topologi))

## 1b. Perencanaan (Planning)

- [Planning — index](planning/README.md) — ringkasan status aplikasi.
- [Blueprint arsitektur](planning/blueprint.md) — cetak biru platform.
- [Roadmap aplikasi](planning/roadmap.md) — peta jalan per fase.
- [Checklist aplikasi](planning/checklist.md) — status sudah/akan dibuat.
- [Planning per modul](planning/modules/README.md) — rincian modul yang sudah ada.

## 2. Panduan Utama

- [Menjalankan stack](development/run.md) — setup env, langkah menjalankan
  ketiga komponen + database.
- [Konvensi API & kode](development/conventions.md) — auth, error format,
  routing, pola endpoint.
- [Audit keamanan](development/security.md) — temuan, perbaikan, dan
  checklist go-live untuk ekspos publik.

## 3. Structure of osc_docs

```
osc_docs/
├── frontend/          # dokumen teknis osc_site
├── backend/           # dokumen teknis osc_rest
├── database/          # dokumen teknis osc_base
├── (osc_auto/)        # biner agen per-VM (di root repo, bukan di osc_docs)
├── development/       # panduan pengembangan (run, konvensi)
├── planning/          # perencanaan, blueprint & checklist aplikasi
├── testing/           # unit test Python (backend API + logika frontend)
├── config/            # rahasia & konfigurasi sensitif (dilindungi)
└── media/             # aset gambar/logo
```

## 4. Quick Links

| Task | Dokumen |
|---|---|
| Menjalankan DB + migrasi | [development/run.md](development/run.md) |
| Menjalankan backend & frontend dev | [development/run.md](development/run.md) |
| Memahami auth & error API | [development/conventions.md](development/conventions.md) |
| Audit & hardening keamanan | [development/security.md](development/security.md) |
| Menambah model database | [database/README.md](database/README.md) |
| Menambah endpoint backend | [backend/README.md](backend/README.md) |
| Melihat perencanaan & roadmap | [planning/README.md](planning/README.md) |
| Cek status aplikasi | [planning/checklist.md](planning/checklist.md) |
| Menjalankan unit test | [development/run.md](development/run.md#6-unit-test-python--osc_docs-testing)