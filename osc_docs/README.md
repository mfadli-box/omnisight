# Dokumentasi OmniSight

Dokumen ini adalah pintu masuk seluruh dokumentasi. OmniSight dibangun bertahap: dokumentasi produk dan teknis disetujui lebih dahulu, lalu implementasi mengikuti dokumen, bukan sebaliknya.

## Status dokumentasi

| Versi | Status | Keterangan |
|---|---|---|
| 0.1 | Arsip | Struktur awal, cakupan modul, skema database, kontrak API, agent, frontend, keamanan, operasi |
| 0.2 | Arsip | Tinjauan konsistensi awal dengan penomoran `AA00-nn` |
| 0.3 | Arsip | Penomoran modul diubah ke dua huruf (`AA`, `AB`, …); Dashboard menjadi 3 submenu |
| 0.4 | Arsip | Dual bahasa `en` (default) dan `id`; locale per pengguna di backend dan frontend |
| 0.5 | Arsip | Dokumen unit test, fungsi, dan alur data per peran: agent, database, backend, frontend |
| 0.6 | Disetujui | Matriks izin, UAT per modul, spesifikasi UI, alert/eskalasi, impor data, panduan pengguna; peran platform dan `requester`; AM08 Impersonasi. Disetujui pada 2026-10-30 (G0) |

Status tiap dokumen mengikuti salah satu label berikut:

- **Draft**: masih bisa berubah.
- **Review**: siap dibahas tim.
- **Disetujui**: menjadi acuan implementasi.
- **Usang**: digantikan dokumen lain, tidak dihapus agar jejak keputusan tetap ada.

## Hasil tinjauan konsistensi 0.3

- 13 modul `AA` sampai `AM` dan 75 submenu memiliki kode yang sama di peta modul, peta menu, database, API, dan keamanan.
- Semua tautan Markdown internal menuju file yang ada.
- Rute dan endpoint di `technical/frontend/peta-menu.md` kini memiliki padanan di `technical/backend/kontrak-api.md`.
- Endpoint lintas modul dipisahkan: integrasi jaringan, monitoring, edge, backup, akses, dan audit memakai izin modulnya sendiri, bukan izin `AM`.
- Empat berkas compose agent lolos validasi YAML.
- Tidak ada implementasi kode yang dimulai pada tahap ini.

## Hasil tinjauan konsistensi 0.4

- Bahasa Inggris menjadi default; bahasa Indonesia tersedia dan dapat dipilih per pengguna.
- Locale per pengguna disimpan di `core.users.locale` dengan nilai `en`/`id`; locale perusahaan menjadi fallback.
- API menerima `Accept-Language`, membalas `Content-Language`, dan memakai urutan `Accept-Language` > locale pengguna > locale perusahaan > `en`.
- Katalog backend berada di `osc_rest/locales/en.json` dan `id.json`; katalog frontend di `messages/en.json` dan `id.json`.
- Pemilih bahasa tersedia di header dan halaman preferensi profil (`CG09`); perubahan memakai `PATCH /auth/me`.
- Kode error, kode modul, dan kode status tetap sama di semua bahasa; hanya `message`/`reason` yang diterjemahkan.
- Keputusan dicatat sebagai ADR-013.
- Jumlah modul (13) dan submenu (75) tidak berubah.
- Tidak ada implementasi kode yang dimulai pada tahap ini.

## Hasil tinjauan konsistensi 0.5

- Tiga kelompok dokumen baru ditambahkan: `qaqc/unit-test`, `qaqc/function`, dan `qaqc/data-flow`.
- Setiap kelompok memiliki subfolder `agent`, `database`, `backend`, dan `frontend`.
- Unit test memisahkan tes murni dari integration/E2E; data uji wajib sintetis dan dua tenant.
- Dokumen fungsi memakai kode `AG-F-nn`, `DB-F-nn`, `BE-F-nn`, dan `FE-F-nn`.
- Dokumen alur data mencakup batas kepercayaan, data yang dilarang, kegagalan, dan pemulihan.
- Semua dokumen baru tertaut dari indeks ini dan dari dokumen teknis terkait.
- Status dokumentasi naik ke 0.5 Review; belum ada implementasi kode.

## Hasil tinjauan konsistensi 0.6

- Matriks izin lengkap ditambahkan di `security/matriks-izin.md`; mencakup seluruh submodul, scope, sensitivitas, approval, dan self-service.
- UAT per modul ditambahkan di `qaqc/acceptance/`; setiap modul memiliki skenario positif, negatif, bukti, dan kriteria lulus.
- Peran `requester` ditambahkan sebagai role sistem; peran platform disimpan di `core.user_platform_roles`.
- Submenu `AM08` Impersonasi dan Dukungan ditambahkan; total submenu menjadi 76.
- Izin submodul sensitif konsisten dipakai di peta modul, peta menu, kontrak API, dan matriks izin.
- Spesifikasi UI menetapkan token desain, layout, izin, komponen inti, layar kunci, dan pemetaan error envelope.
- Kebijakan alert menetapkan severity, ambang awal, routing, eskalasi, silence, dan siklus insiden.
- Runbook impor data menetapkan dry-run, approval, batch, rekonsiliasi, dan rollback.
- Panduan pengguna mencakup login, tugas per peran, approval, keamanan akun, dan penanganan error.
- Registry kode error memusatkan kode global dan modul, aturan alokasi, lokalisasi, retry, dan audit.
- Glosarium menyatukan istilah lintas dokumen.
- Pipeline CI/CD dan rencana implementasi WP-01 sampai WP-12 menetapkan gerbang build, tes, keamanan, deploy, dan urutan pekerjaan.
- Semua tautan internal dan pagar kode divalidasi dengan skrip Python.
- Kontrak mesin-terbaca ditambahkan di `technical/contracts/`: izin, kode error, katalog `en`/`id`, OpenAPI 3.1, dan fondasi Prisma. Disetujui bersama 0.6 pada G0.
- G0 disetujui pada 2026-10-30; implementasi boleh dimulai dari WP-01.
- Belum ada implementasi kode.

## Peta dokumen

### Produk

| Dokumen | Isi |
|---|---|
| [product/README.md](product/README.md) | Visi, persona, ruang lingkup, roadmap, prinsip produk |
| [product/peta-modul.md](product/peta-modul.md) | Daftar modul dan menu dengan kode `AA`, `AB`, … |
| [product/panduan-pengguna.md](product/panduan-pengguna.md) | Panduan harian pengguna dan admin per peran |
| [product/glosarium.md](product/glosarium.md) | Istilah inti organisasi, API, keamanan, operasi, dan QA |
| [product/referensi-aplikasi.md](product/referensi-aplikasi.md) | Aplikasi nyata yang menjadi acuan dan keputusan build/integrate |

### Teknis

| Dokumen | Isi |
|---|---|
| [technical/contracts/README.md](technical/contracts/README.md) | Kontrak mesin-terbaca: izin, error, OpenAPI, Prisma, locale, validator |
| [technical/database/README.md](technical/database/README.md) | Prinsip database, cluster, ERD, konvensi |
| [technical/database/skema-inti.md](technical/database/skema-inti.md) | Perusahaan, area, pengguna, peran, HRIS, sesi, audit |
| [technical/database/skema-aset-jaringan.md](technical/database/skema-aset-jaringan.md) | Aset fisik, lokasi, jaringan, IPAM, MikroTik, domain |
| [technical/database/skema-operasi-monitoring.md](technical/database/skema-operasi-monitoring.md) | Agent, metrik, alert, container, job, backup, bastion |
| [technical/database/skema-layanan-konten-audit.md](technical/database/skema-layanan-konten-audit.md) | Tiket, kontrak, artikel, notifikasi, audit, keamanan |
| [technical/database/prisma-dan-migrasi.md](technical/database/prisma-dan-migrasi.md) | Aturan Prisma, migrasi, seed, peran SQLx |
| [technical/backend/README.md](technical/backend/README.md) | Clean architecture Rust, crate, alur request |
| [technical/backend/topologi-dan-akses.md](technical/backend/topologi-dan-akses.md) | Zona jaringan, topologi, level akses, alur data |
| [technical/backend/kontrak-api.md](technical/backend/kontrak-api.md) | Envelope, kode, kebijakan HTTP, contoh endpoint |
| [technical/backend/kode-error.md](technical/backend/kode-error.md) | Registry kode global/modul, alokasi, retry, audit, alert |
| [technical/backend/adapter-integrasi.md](technical/backend/adapter-integrasi.md) | Pola adapter HRIS, RouterOS, Docker/Podman, Wazuh, dll. |
| [technical/agent/README.md](technical/agent/README.md) | Arsitektur agent, enrollment, keamanan, matriks agent |
| [technical/agent/ubuntu.md](technical/agent/ubuntu.md) | Pemasangan dan hardening agent di Ubuntu |
| [technical/agent/windows.md](technical/agent/windows.md) | Pemasangan dan hardening agent di Windows |
| [technical/agent/compose/README.md](technical/agent/compose/README.md) | Cara memakai compose satuan |
| [technical/frontend/README.md](technical/frontend/README.md) | Clean architecture Next.js, auth, komponen |
| [technical/frontend/peta-menu.md](technical/frontend/peta-menu.md) | Menu, rute, izin, API, dan relasi backend |
| [technical/frontend/spesifikasi-ui.md](technical/frontend/spesifikasi-ui.md) | Token desain, layout, komponen, layar kunci, error, aksesibilitas |
| [technical/frontend/alur-dan-arsitektur.md](technical/frontend/alur-dan-arsitektur.md) | Alur login, scope, state, penanganan error |

### Pengujian, fungsi, dan alur data

| Dokumen | Isi |
|---|---|
| [qaqc/README.md](qaqc/README.md) | Indeks QA/QC; unit test per peran: [agent](qaqc/unit-test/agent/README.md), [database](qaqc/unit-test/database/README.md), [backend](qaqc/unit-test/backend/README.md), [frontend](qaqc/unit-test/frontend/README.md) |
| [qaqc/function/README.md](qaqc/function/README.md) | Katalog fungsi; per peran: [agent](qaqc/function/agent/README.md), [database](qaqc/function/database/README.md), [backend](qaqc/function/backend/README.md), [frontend](qaqc/function/frontend/README.md) |
| [qaqc/data-flow/README.md](qaqc/data-flow/README.md) | Alur dan batas data; per peran: [agent](qaqc/data-flow/agent/README.md), [database](qaqc/data-flow/database/README.md), [backend](qaqc/data-flow/backend/README.md), [frontend](qaqc/data-flow/frontend/README.md) |
| [qaqc/acceptance/README.md](qaqc/acceptance/README.md) | UAT per modul, skenario global, kriteria lulus, dan bukti |

### Keamanan, operasi, tata kelola

| Dokumen | Isi |
|---|---|
| [security/README.md](security/README.md) | Threat model, kontrol keamanan, checklist pentest |
| [security/matriks-izin.md](security/matriks-izin.md) | Katalog izin, peran, scope, approval, dan self-service |
| [operations/README.md](operations/README.md) | Deployment Docker/Podman, backup, runbook, DR |
| [operations/ci-cd.md](operations/ci-cd.md) | Pipeline build, tes, scan, artefak, deploy, rollback |
| [operations/alert-dan-eskalasi.md](operations/alert-dan-eskalasi.md) | Severity, ambang default, routing, eskalasi, siklus insiden |
| [operations/impor-data.md](operations/impor-data.md) | Impor awal HRIS, aset, jaringan; dry-run, commit, rollback |
| [governance/README.md](governance/README.md) | Standar dokumen, kode modul, review, definisi selesai |
| [governance/rencana-implementasi.md](governance/rencana-implementasi.md) | Work package, dependensi, gerbang, dan definisi selesai |
| [governance/keputusan-arsitektur.md](governance/keputusan-arsitektur.md) | ADR ringkas untuk keputusan penting |

## Konvensi kode modul AA

Kode modul memakai dua huruf berurutan, dan submenu memakai kode modul diikuti dua digit.

```text
AA  Ringkasan dan Dashboard
AB  Identitas, Organisasi, dan Akses
AC  Manajemen Aset
AD  Jaringan dan IPAM
AE  Monitoring Infrastruktur
AF  Operasi Container dan Layanan
AG  Edge, Domain, dan Sertifikat
AH  Backup dan Konfigurasi
AI  Akses Aman (Bastion)
AJ  Layanan dan Kontrak (Helpdesk)
AK  Konten, Notifikasi, dan Pengetahuan
AL  Audit dan Keamanan
AM  Pengaturan Platform dan Integrasi
```

Submodul memakai kode modul + dua digit, misalnya `AB03` untuk Peran dan Izin. Izin memakai format `AB:read` dan `AB:post`; izin submenu sensitif memakai `AB03:read/post`.

Aturan lengkap ada di [governance/README.md](governance/README.md).

## Konvensi dual bahasa

- Bahasa yang didukung: `en` (default) dan `id`.
- Bahasa ditentukan per pengguna dan disimpan di `core.users.locale`.
- Frontend mengirim `Accept-Language` sesuai bahasa aktif; backend membalas `Content-Language`.
- Katalog pesan memakai kunci stabil dot.case, misalnya `auth.invalid_credentials`.
- `en` dan `id` wajib memiliki kunci yang sama; CI memeriksa paritas.
- Kunci yang hilang jatuh ke `en`, bukan halaman error.
- Kode error dan kode modul tidak diterjemahkan.
- Tanggal dan angka dikirim API dalam ISO 8601/nilai mentah, lalu diformat frontend sesuai locale.

## Penamaan

| Konteks | Gaya | Contoh |
|---|---|---|
| Tabel database | snake_case, plural | `asset_assignments` |
| Kolom database | snake_case | `company_id` |
| Skema PostgreSQL | snake_case | `core`, `asset`, `network` |
| Path API | kebab-case | `/api/v1/identity/users` |
| Kode modul | dua huruf | `AC` |
| Submodul | `<modul><nn>` | `AC02` |
| Izin | `<modul>:<aksi>` | `AC:post` |
| Kunci terjemahan | dot.case | `assets.title` |
| Locale | ISO 639-1 | `en`, `id` |
| Kode fungsi | `<peran>-F-nn` | `BE-F-07` |
| Kode UAT | `UAT-<modul>-nn` | `UAT-AC-04` |
| Komponen React | PascalCase | `AssetTable` |
| File TypeScript | kebab-case | `asset-table.tsx` |
| Perintah/CLI | kebab-case | `agent-host` |
| Variabel lingkungan | SCREAMING_SNAKE_CASE | `OSC_CONTROLLER_URL` |

## Alur membaca yang disarankan

1. **Manajemen/stakeholder**: `product/README.md`, `product/peta-modul.md`, `product/panduan-pengguna.md`, `product/glosarium.md`, `security/README.md` bagian ringkasan.
2. **Backend**: `technical/backend/kontrak-api.md`, `technical/backend/kode-error.md`, `technical/database/*`, `technical/backend/topologi-dan-akses.md`.
3. **Frontend**: `technical/frontend/peta-menu.md`, `technical/frontend/spesifikasi-ui.md`, `technical/backend/kontrak-api.md`.
4. **Agent/operasi**: `technical/agent/README.md`, `technical/agent/compose/README.md`, `operations/README.md`, `operations/ci-cd.md`, `operations/alert-dan-eskalasi.md`, `operations/impor-data.md`.
5. **Keamanan**: `security/README.md`, `security/matriks-izin.md`, lalu checklist per modul di dokumen modul terkait.
6. **Perilaku dan pengujian**: `qaqc/function/*`, `qaqc/data-flow/*`, lalu `qaqc/unit-test/*` sesuai peran.
7. **Penerimaan**: `qaqc/acceptance/README.md`, lalu dokumen UAT modul yang diuji.
8. **Implementasi**: `governance/rencana-implementasi.md`, `operations/ci-cd.md`, `technical/contracts/README.md`, lalu dokumen teknis modul yang dikerjakan.

## Aturan perubahan dokumen

- Perubahan skema database, kontrak API, kode modul, atau kebijakan keamanan wajib melewati review pemilik dokumen.
- Keputusan besar dicatat di `governance/keputusan-arsitektur.md`.
- Dokumen tidak boleh memuat password, token, kunci, data pribadi, atau detail infrastruktur klien yang sensitif.
- Jika implementasi menyimpang dari dokumen, perbarui dokumen pada perubahan yang sama, bukan setelahnya.
