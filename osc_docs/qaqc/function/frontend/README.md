# Fungsi Frontend

Status: Disetujui (0.6)

Frontend Next.js menampilkan portal, memandu alur kerja, dan memanggil API same-origin. Frontend tidak mengakses database, vault, Docker socket, atau integrasi eksternal secara langsung.

## 1. Katalog fungsi

| Kode | Fungsi | Penjelasan |
|---|---|---|
| FE-F-01 | Login | Form lokal/HRIS, MFA, pesan generik |
| FE-F-02 | Konteks perusahaan/area | Pemilih header, invalidasi query, scope baru |
| FE-F-03 | Menu dan izin | Sembunyikan menu tanpa izin; server tetap memeriksa |
| FE-F-04 | Server fetch | Server Component mengambil data awal |
| FE-F-05 | Client query | TanStack Query untuk filter, pagination, aksi |
| FE-F-06 | Form | React Hook Form + Zod, validasi server tetap wajib |
| FE-F-07 | Approval | Diff, risiko, alasan, setujui/tolak |
| FE-F-08 | Dashboard dan grafik | Ringkasan, uPlot untuk metrik padat |
| FE-F-09 | Audit viewer | Filter, diff, redaksi, ekspor dengan izin |
| FE-F-10 | Upload/download | Batas ukuran, jenis file, audit |
| FE-F-11 | Notifikasi | In-app, preferensi, deduplikasi |
| FE-F-12 | Lokalisasi | `en` default, `id` per pengguna, fallback `en` |
| FE-F-13 | Error dan pemulihan | Envelope, request id, countdown retry |

## 2. Server dan client

| Kebutuhan | Server Component | Client Component |
|---|---|---|
| Render awal halaman | Ya | Tidak |
| Baca cookie sesi | Ya | Tidak |
| Filter/pagination interaktif | Tidak | Ya |
| Form dan dialog | Tidak | Ya |
| Approval dan aksi tulis | Tidak | Ya |
| Lokalisasi | `getTranslations()` | `useTranslations()` |

## 3. Batas tanggung jawab

- Tidak menyimpan token di `localStorage` atau `sessionStorage`.
- Tidak memanggil host internal atau integrasi langsung.
- Tidak memakai `dangerouslySetInnerHTML` untuk input pengguna.
- Tidak menampilkan data di luar scope hanya karena disembunyikan di UI.
- Tidak memakai terjemahan untuk keputusan izin.
- Tidak meng-cache halaman terautentikasi secara bersama.

## 4. Pemetaan rute

| Prefix | Fungsi |
|---|---|
| CP | Halaman publik |
| CA | Login, MFA, pilih perusahaan, akses ditolak |
| CG | Profil, bahasa, notifikasi, pencarian, bantuan |
| AA–AM | Modul portal sesuai izin |

## 5. Checklist

- [ ] Setiap menu memiliki cek izin.
- [ ] Setiap form memiliki validasi klien dan server.
- [ ] Error envelope ditangani.
- [ ] Bahasa `en` dan `id` tersedia.
- [ ] Tidak ada token di storage.
- [ ] Query key memuat tenant/area.
- [ ] Approval memakai idempotency.
- [ ] Aksesibilitas dasar lulus.
