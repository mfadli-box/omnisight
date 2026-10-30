# OmniSight

OmniSight adalah rencana platform DevSecOps satu pintu untuk mengelola identitas, aset, jaringan, monitoring, container, akses aman, layanan, konten, dan audit dalam satu portal. Platform dirancang untuk dipakai oleh satu perusahaan maupun banyak perusahaan (multi-tenant), dengan pembatasan akses sampai tingkat area.

Status saat ini: **dokumentasi 0.6 disetujui pada 2026-10-30 (G0)**. Implementasi dimulai dari `osc_base` (skema dan migrasi), lalu `osc_rest`, `osc_site`, `osc_auto`, dan agent. Belum ada kode produksi pada saat persetujuan ini dicatat.

Kontrak mesin-terbaca (izin, kode error, OpenAPI, Prisma, locale) tersedia di [osc_docs/technical/contracts](osc_docs/technical/contracts/README.md) dan berstatus disetujui bersama 0.6. Aturan kerja untuk agen AI ada di [AGENTS.md](AGENTS.md).

## Struktur proyek

```text
omnisight/
├── osc_base/   # PostgreSQL + Prisma (skema dan migrasi saja)
├── osc_rest/   # Backend REST API Rust, clean architecture
├── osc_auto/   # Microservice Go: collector, scheduler, notifier, worker
├── osc_site/   # Frontend Next.js, React, TypeScript, Tailwind, shadcn/ui
├── osc_docs/   # Dokumentasi produk, teknis, keamanan, operasi, tata kelola
└── README.md
```

Folder `osc_base`, `osc_rest`, `osc_auto`, dan `osc_site` pada tahap ini hanya berisi README penanda. Isi kode akan dibuat setelah dokumen disetujui.

## Dokumen utama

- [Indeks dokumentasi](osc_docs/README.md)
- [Visi, persona, dan roadmap](osc_docs/product/README.md)
- [Peta modul dan menu AA](osc_docs/product/peta-modul.md)
- [Panduan pengguna dan admin](osc_docs/product/panduan-pengguna.md)
- [Glosarium](osc_docs/product/glosarium.md)
- [Referensi aplikasi nyata](osc_docs/product/referensi-aplikasi.md)
- [Kontrak mesin-terbaca](osc_docs/technical/contracts/README.md)
- [Database](osc_docs/technical/database/README.md)
- [Backend Rust](osc_docs/technical/backend/README.md)
- [Registry kode error](osc_docs/technical/backend/kode-error.md)
- [Agent dan compose satuan](osc_docs/technical/agent/README.md)
- [Frontend](osc_docs/technical/frontend/README.md)
- [Spesifikasi UI](osc_docs/technical/frontend/spesifikasi-ui.md)
- [QA/QC dan unit test per peran](osc_docs/qaqc/README.md)
- [Fungsi per peran](osc_docs/qaqc/function/README.md)
- [Alur data per peran](osc_docs/qaqc/data-flow/README.md)
- [UAT dan kriteria penerimaan](osc_docs/qaqc/acceptance/README.md)
- [Keamanan](osc_docs/security/README.md)
- [Matriks izin](osc_docs/security/matriks-izin.md)
- [Operasi dan deployment](osc_docs/operations/README.md)
- [CI/CD dan gerbang rilis](osc_docs/operations/ci-cd.md)
- [Alert dan eskalasi](osc_docs/operations/alert-dan-eskalasi.md)
- [Impor dan migrasi data](osc_docs/operations/impor-data.md)
- [Rencana implementasi](osc_docs/governance/rencana-implementasi.md)
- [Tata kelola dokumentasi](osc_docs/governance/README.md)

## Stack yang direncanakan

| Komponen | Teknologi | Peran |
|---|---|---|
| osc_base | PostgreSQL + Prisma | Skema, migrasi, seed. Prisma tidak dipakai sebagai ORM runtime. |
| osc_rest | Rust + Axum + SQLx | Satu-satunya pintu tulis ke database domain, autentikasi, otorisasi, adapter integrasi. |
| osc_auto | Go | Collector metrik, scheduler, notifier, worker backup/sync. Berjalan di Ubuntu dan Windows. |
| osc_site | Next.js + React + TypeScript + Tailwind + shadcn/ui | Portal pengguna dan admin. |
| Agent | Go | Berjalan di host Ubuntu/Windows, outbound-only, mTLS. |
| Edge | Nginx/Traefik + WAF | TLS, routing, rate limit, proteksi awal. |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki | Metrik, log, trace platform itu sendiri. |

## Prinsip utama

1. **Satu pintu tulis data domain**: hanya `osc_rest` yang menulis ke database domain. `osc_auto` dan agent memakai API internal/agent yang terautentikasi.
2. **Multi-tenant yang ketat**: `company_id` wajib pada data tenant, scope area divalidasi server, dan PostgreSQL RLS menjadi lapisan pertahanan kedua.
3. **Least privilege**: pengguna hanya punya aksi `read` dan `post` per modul, dengan scope perusahaan/area. Tindakan berbahaya memerlukan persetujuan dan audit.
4. **Audit tidak bisa diam-diam dihapus**: audit trail memakai hash chain dan retensi terkontrol.
5. **Agent outbound-only**: agent tidak membuka port masuk, memakai mTLS, dan tidak menyimpan kredensial jangka panjang bila bisa dihindari.
6. **Respons API konsisten**: hasil bisnis selalu HTTP 200 dengan envelope dan kode. Tidak memakai 403 dan tidak membocorkan 5xx ke pengguna.
7. **Secure by default**: container read-only, non-root, cap drop, tanpa Docker socket mentah, rahasia di vault/secret file, dependency dipindai.
8. **Build vs integrate sadar lisensi**: aplikasi referensi menjadi acuan fitur, bukan kode yang disalin. Integrasi opsional dipilih jika klien sudah memilikinya.
9. **Dual bahasa**: label dan pesan tersedia dalam bahasa Inggris (default) dan Indonesia. Setiap pengguna dapat memilih bahasanya; kode error tetap sama di semua bahasa.

## Batasan yang perlu dipahami

- Tidak ada sistem yang "100% tidak bisa diretas". Dokumen keamanan memakai pertahanan berlapis, pengujian berkelanjutan, dan prosedur respons insiden.
- Dokumen ini tidak meminta data pribadi, password, kunci API, atau rahasia perusahaan. Semua contoh memakai placeholder.
- Kebijakan HTTP 200 untuk hasil bisnis bukan pengganti otorisasi. Penolakan akses tetap dicatat, dihitung, dan dipantau.

## Cara membaca

Mulai dari [indeks dokumentasi](osc_docs/README.md), lalu baca `product/peta-modul.md` untuk memahami cakupan. Dokumen teknis merujuk balik ke kode modul `AA`, `AB`, dan seterusnya agar database, API, menu, dan izin dapat ditelusuri.
