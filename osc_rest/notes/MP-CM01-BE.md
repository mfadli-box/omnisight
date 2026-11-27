# MP-CM01-BE — Autentikasi HRIS dan pemulihan

## Objektif

Memverifikasi kredensial memakai HRIS perusahaan penempatan, memperbarui hash cadangan setelah HRIS menerima kredensial, serta menerbitkan JWT untuk perusahaan operasional setelah seluruh pemeriksaan berhasil.

## Scope/Keputusan

`GET /baas/v1/public/companies` membaca perusahaan aktif dan hanya mengembalikan ID serta nama. Batas waktu query tiga detik. Kegagalan akses database ditangani dengan HTTP 503.
- Adaptor `reqwest` memakai batas waktu total tiga detik, daftar host `HRIS_ALLOWED_HOSTS`, HTTPS untuk host jaringan dan batas respons 16 KiB. HTTP hanya tersedia pada alamat IP loopback yang diizinkan. Klien menonaktifkan pengalihan dan proksi.
- Parser `quick-xml` membaca elemen `string` dalam namespace `App.Login` dan menolak DTD. Kesalahan konfigurasi menutup akses. Gangguan transport, HTTP 5xx, atau XML yang tidak dapat diproses memicu pemeriksaan hash cadangan.
- Rute login dan verifikasi MFA tersedia di bawah `/api/v1/auth` dan `/baas/v1/auth`. JWT HS256 memuat identitas pengguna, perusahaan operasional dan role dari pemberian akses. Token HRIS tetap internal.
- Tantangan MFA sekali pakai berlaku lima menit dengan maksimal lima percobaan. Penyimpanan tantangan dan penghitung percobaan login berada di memori proses. Deployment dengan beberapa replika memerlukan afinitas sesi untuk kedua tahap MFA.

## Hasil Eksekusi

Login HRIS berhasil memakai mekanisme pembaruan Argon2id yang sudah ada. Status 0 menolak akses meskipun hash cadangan cocok. Login pemulihan yang berhasil mengirimkan `warning_flag` ke klien. Kebijakan MFA pengguna, perusahaan penempatan, dan perusahaan operasional diperiksa sebelum penerbitan JWT.

## Status Verifikasi
- `passed` — dua unit test Rust pada modul autentikasi terisolasi, meliputi XML dan keputusan fallback.
- `passed` — uji integrasi rute autentikasi dengan PostgreSQL 18.7 dan HRIS tiruan. Skenario mencakup tanda tangan dan claims JWT, pembaruan hash, status 0, timeout tiga detik, XML rusak, HTTP 503, password cadangan salah, akses perusahaan, MFA dan penggunaan ulang tantangan, serta login lokal.
- `passed` — pemeriksaan format Rust pada berkas logika autentikasi.
- `passed` — seluruh tujuh skenario `osc_docs/test_flows/CM01-F.py` pada 28 November 2026.
