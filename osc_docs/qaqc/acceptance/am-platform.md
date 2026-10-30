# UAT Modul AM Pengaturan Platform dan Integrasi

Status: Disetujui (0.6)

## 1. Cakupan

Integrasi dan adapter, kredensial dan vault, webhook dan API key, scheduler, pengaturan platform, feature flag, branding, serta impersonasi.

## 2. Prasyarat

- Stub integrasi dengan kredensial uji yang tidak nyata.
- Akun `platform_owner`, `platform_support`, `platform_security`, `company_admin`, dan `auditor`.
- Dua perusahaan untuk menguji isolasi feature flag dan pengaturan.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AM-01 | Integrasi dan rahasia | company_admin | Tambah integrasi; uji koneksi; buka detail; simpan URL tidak diizinkan | Integrasi tersimpan; rahasia hanya referensi vault; URL tidak diizinkan dan SSRF ditolak; audit mencatat perubahan | BE-F-10 |
| UAT-AM-02 | Rotasi vault | company_admin dan approver | Rotasi kredensial tanpa approval; ulangi dengan approval dan MFA | Tanpa approval ditolak; setelah approval berhasil; nilai lama tidak berlaku; nilai rahasia tidak pernah tampil | BE-F-07, BE-F-10 |
| UAT-AM-03 | API key | company_admin | Buat API key; buka daftar; cabut key | Key ditampilkan sekali; hanya hash yang tersimpan; scope dan expiry berlaku; pencabutan langsung; pemakaian tercatat | BE-F-06, BE-F-09 |
| UAT-AM-04 | Webhook | company_admin | Kirim event; matikan endpoint; lihat retry dan signature | Retry dengan backoff; signature dapat diverifikasi; kegagalan terlihat; tidak ada rahasia di payload log | BE-F-06, BE-F-10 |
| UAT-AM-05 | Scheduler | company_admin | Jalankan job manual; picu retry; jalankan dua job yang sama | Job berjalan sesuai concurrency; retry aman; manual run tercatat; tidak ada eksekusi ganda | BE-F-08, BE-F-09 |
| UAT-AM-06 | Pengaturan dan feature flag | company_admin | Ubah locale default perusahaan; aktifkan flag untuk perusahaan A | Locale default berubah; flag hanya berlaku di perusahaan A; perusahaan B tidak terpengaruh; audit mencatat | BE-F-06, BE-F-12 |
| UAT-AM-07 | Branding | company_admin | Unggah logo valid; unggah file berisi script; ubah warna | Logo valid tampil; file berbahaya ditolak; tidak ada script yang dieksekusi; perubahan tercatat | BE-F-06, FE-F-10 |
| UAT-AM-08 | Impersonasi | platform_owner | Mulai impersonasi tanpa alasan; ulangi dengan alasan dan MFA; akses aksi sensitif; tunggu batas waktu | Tanpa alasan atau MFA ditolak; banner tampil; aksi sensitif tetap memerlukan approval pengguna lain; sesi berakhir otomatis; semua aksi tercatat | BE-F-05, BE-F-09 |
| UAT-AM-09 | Batas peran platform | platform_support | Buka data aset, tiket, dan audit perusahaan | Data bisnis tidak terlihat tanpa impersonasi; platform_support hanya membaca status dan audit platform; percobaan ditolak `AA00-00-0003` | BE-F-05 |
| UAT-AM-10 | Isolasi pengaturan | auditor | Buka pengaturan perusahaan B dari sesi perusahaan A | Pengaturan perusahaan B `AA00-00-0004`; auditor hanya membaca; perubahan ditolak | BE-F-05, DB-F-02 |
| UAT-AM-11 | Bahasa dan error | company_admin | Simpan pengaturan tidak valid; ganti bahasa | Validasi `AA00-00-0001` terlokalisasi; kode tetap; tidak ada 5xx; locale default perusahaan tetap konsisten | BE-F-12, FE-F-13 |

## 4. Kriteria lulus

- Rahasia tidak pernah dikembalikan API atau ditampilkan UI.
- Impersonasi tidak dapat dipakai untuk melewati approval.
- Peran platform tidak membaca data bisnis tanpa impersonasi.
- Pengaturan dan feature flag terisolasi per perusahaan.
- Seluruh skenario global yang relevan berstatus `Lulus`.
- Tidak ada temuan S1 atau S2; temuan S3 ditutup atau disetujui risikonya.
- Bukti tersimpan dan audit event dapat ditemukan dari `request_id`.

## 5. Bukti yang dikumpulkan

- Screenshot atau rekaman layar untuk alur utama dan penolakan.
- `request_id` dan ID audit untuk setiap aksi tulis.
- Kutipan respons envelope untuk kasus negatif.
- Hasil ekspor atau unduhan yang diuji, bila ada.
- Catatan versi build, migrasi, dan katalog bahasa.

## 6. Rujukan fungsi

`BE-F-05`, `BE-F-06`, `BE-F-07`, `BE-F-08`, `BE-F-09`, `BE-F-10`, `BE-F-12`, `DB-F-02`, `FE-F-10`, `FE-F-13`
