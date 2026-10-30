# AGENTS.md — Aturan Kerja OmniSight

Dokumen ini adalah kontrak kerja untuk agen AI dan kontributor manusia. Baca sebelum mengubah apa pun.

## 1. Status dan gerbang

- Dokumentasi **0.6 disetujui** pada 2026-10-30. Gate **G0 disetujui**.
- Implementasi boleh dimulai dari **WP-01** di `osc_base`, `osc_rest`, `osc_auto`, dan `osc_site`, mengikuti urutan work package.
- Artefak di `osc_docs/technical/contracts/` berstatus **disetujui**. Perubahan wajib memperbarui dokumen sumber, generator, dan UAT terkait pada perubahan yang sama.
- Deploy, migrasi destruktif, dan perubahan infrastruktur bersama tetap memerlukan persetujuan eksplisit.
- Urutan pengerjaan dan gerbang ada di [rencana implementasi](osc_docs/governance/rencana-implementasi.md).

## 2. Peta repositori

| Folder | Isi | Catatan |
|---|---|---|
| `osc_base` | PostgreSQL + Prisma | Skema dan migrasi saja; Prisma Client tidak dipakai runtime |
| `osc_rest` | Rust + Axum + SQLx | Satu-satunya pintu tulis data domain |
| `osc_auto` | Go | Collector, scheduler, notifier, worker |
| `osc_site` | Next.js | Portal pengguna dan admin |
| `osc_docs` | Dokumentasi dan kontrak | Sumber kebenaran sebelum kode |

## 3. Urutan membaca

1. [Indeks dokumentasi](osc_docs/README.md)
2. [Peta modul](osc_docs/product/peta-modul.md)
3. [Matriks izin](osc_docs/security/matriks-izin.md)
4. [Kontrak API](osc_docs/technical/backend/kontrak-api.md)
5. [Registry kode error](osc_docs/technical/backend/kode-error.md)
6. [Skema database](osc_docs/technical/database/README.md)
7. [Peta menu](osc_docs/technical/frontend/peta-menu.md)
8. [Kontrak mesin-terbaca](osc_docs/technical/contracts/README.md)
9. Work package terkait di [rencana implementasi](osc_docs/governance/rencana-implementasi.md)

## 4. Aturan yang tidak boleh dilanggar

### HTTP dan error

- Hasil bisnis selalu **HTTP 200** dengan envelope `ok/code/message/data/meta/errors`.
- **Tidak boleh 403.** Penolakan akses memakai kode error dan tetap dicatat di audit/metrik.
- **Tidak boleh 5xx aplikasi.** Kegagalan internal dipetakan ke `AA00-00-0900`; detail hanya di log internal.
- Pengecualian status HTTP nyata hanya `/internal/healthz` dan `/internal/metrics`, hanya di jaringan internal.
- Kode error stabil dan tidak diterjemahkan. Pesan mengikuti locale.

### Tenant dan izin

- Setiap tabel tenant memiliki `company_id`; RLS `FORCE` menjadi lapisan kedua.
- Jangan mempercayai `company_id` dari body/header. Ambil dari membership tervalidasi.
- Scope area mencakup turunan. Data di luar scope dijawab sebagai tidak ditemukan, bukan 403.
- Izin dicek server pada setiap request. Menu tersembunyi bukan kontrol keamanan.
- `post` mencakup `read`. Hanya 20 submodul memakai izin submodul; lihat `permissions.json`.
- Aksi sensitif memerlukan alasan, approval, dan audit. Self-approval dilarang.
- Platform role tidak memberi akses data bisnis tanpa impersonasi eksplisit.

### Rahasia dan data pribadi

- Jangan pernah meminta, mencatat, atau meng-commit kata sandi, token, kunci, kredensial, atau data pribadi.
- Semua contoh memakai placeholder. Rahasia disuntik saat deploy dari vault/secret file.
- Kredensial bersifat write-only; API tidak pernah mengembalikannya.
- Audit dan log tidak boleh memuat rahasia, isi file, atau respons HRIS mentah.
- Jangan membuat endpoint yang mengumpulkan data pribadi di luar kebutuhan dokumen.

### Audit dan integritas

- Aksi tulis menghasilkan event audit before/after dengan `request_id`.
- `audit.audit_events` append-only; aplikasi hanya INSERT/SELECT.
- Jangan menghapus audit atau riwayat aset. Retensi hanya lewat prosedur terkontrol.

### Bahasa

- Bahasa didukung: `en` (default) dan `id`; locale per pengguna.
- Setiap string baru wajib punya kunci `en` dan `id` dengan makna setara.
- Kode error, kode modul, dan kode status tidak diterjemahkan.
- Jangan mengubah izin atau scope berdasarkan bahasa.

### Database

- Prisma hanya untuk skema dan migrasi. Runtime memakai SQLx.
- `prisma db push` dilarang di staging/produksi.
- Migrasi harus expand-contract, idempotent, dan diuji dari database kosong serta salinan data.
- RLS, grant, FK komposit, unique parsial, partisi, CHECK, trigger, dan fungsi hash chain ditulis di SQL migrasi.
- Jangan memakai `SELECT *` di kode produksi.

## 5. Cara memakai kontrak

- `permissions.json` menentukan kode izin, scope, sensitivitas, dan approval.
- `kode-error.json` menentukan kode, pesan `en`/`id`, retry, audit, metrik, dan alert.
- `openapi.json` menentukan path, method, izin, scope, dan metadata audit.
- `schema.prisma` adalah fondasi model; detail SQL ada di migrasi.
- Jika kontrak salah, perbaiki **dokumen sumber lebih dahulu**, lalu generator, lalu regenerasi. Jangan mengedit JSON hasil generate secara manual.
- Jika kontrak dan dokumen berbeda, itu bug. Hentikan pekerjaan dan perbaiki keduanya.

## 6. Alur perubahan

1. Tentukan WP dan baca dokumen acuannya.
2. Perbarui dokumen dan/atau kontrak bila perilaku berubah.
3. Ubah kode, migrasi, dan konfigurasi dalam irisan vertikal.
4. Tambahkan unit, integration, dan UAT subset pada perubahan yang sama.
5. Perbarui katalog locale `en`/`id`.
6. Jalankan validator:

```bash
python3 osc_docs/technical/contracts/validate_contracts.py
python3 osc_docs/tools/validate_docs.py
```

7. Perbarui changelog dan UAT bila perlu.
8. Minta review keamanan untuk permukaan baru.

## 7. Definisi selesai

Sebuah perubahan selesai bila:

- [ ] Kode, migrasi, dan konfigurasi ada di `main`.
- [ ] Unit dan integration test lulus; E2E subset lulus.
- [ ] RLS dan isolasi dua tenant diuji.
- [ ] Izin, scope, dan self-service diuji, termasuk kasus negatif.
- [ ] Audit dan `request_id` tersedia untuk aksi tulis.
- [ ] Error terdaftar, terlokalisasi `en`/`id`, dan punya perilaku UI.
- [ ] UI punya state loading, kosong, error, dan aksesibilitas dasar.
- [ ] Health, metrik, log, dan alert untuk permukaan baru tersedia.
- [ ] Dokumentasi, kontrak, UAT, dan changelog diperbarui.
- [ ] Review keamanan selesai.
- [ ] Tidak ada rahasia atau data pribadi di diff.

## 8. Tindakan yang dilarang tanpa persetujuan eksplisit

- Deploy ke staging/produksi atau mengubah infrastruktur bersama.
- Menjalankan migrasi destruktif, `DROP`, atau `prisma db push`.
- Menghapus data, audit, branch, atau file yang bukan buatan sendiri.
- Mengubah pipeline CI/CD, permission, atau konfigurasi rahasia.
- Menambahkan dependensi berat atau lisensi yang belum ditinjau.
- Membuat endpoint, tabel, atau peran baru di luar dokumen dan kontrak.

## 9. Saat ragu

- Untuk perubahan keamanan, izin, audit, atau data pribadi: **berhenti dan minta keputusan manusia**.
- Jangan mengarang field, kode, rute, atau perilaku yang tidak ada di dokumen.
- Catat keputusan arsitektur baru sebagai ADR di `osc_docs/governance/keputusan-arsitektur.md`.
- Jika menemukan inkonsistensi dokumen, laporkan beserta usulan perbaikan, jangan diam-diam memilih salah satu.

## 10. Konvensi singkat

| Konteks | Gaya | Contoh |
|---|---|---|
| Modul | dua huruf | `AC` |
| Submodul | modul + dua digit | `AC04` |
| Izin | `<kode>:read|post` | `AC:post` |
| Kode error global | `AA00-00-xxxx` | `AA00-00-0001` |
| Kode error modul | `<modul>-<submenu>-<nomor>` | `AC-04-2001` |
| Path API | kebab-case | `/api/v1/assets/assets` |
| Tabel/kolom | snake_case | `asset_assignments` |
| Kunci i18n | dot.case | `assets.title` |
| UAT | `UAT-<modul>-nn` | `UAT-AC-04` |
