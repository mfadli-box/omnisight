# MP-CM02-BE — Otorisasi tenant

## Objektif

Memastikan handler CM02 menerima konteks tenant yang telah diverifikasi untuk pengguna dan aksi yang diminta.

## Scope/Keputusan

Router utama memasang `GET /baas/v1/tenant/context` dengan kebijakan `CM02/READ`. Rute publik untuk daftar perusahaan, login, dan MFA tetap dapat diakses sebelum pengguna memperoleh JWT. Parameter kueri `company_id` dan `area_id` bersifat opsional. Tanpa pilihan area, respons berisi `area_id: null` dan hanya menyatakan konteks perusahaan.

## Hasil Eksekusi

Middleware mewajibkan klaim `permissions` dan memeriksa izin token terhadap matriks peran terkini. Pemeriksaan keanggotaan menggunakan `trx_user_company` serta `trx_user_area` saat pengguna memilih area. Handler membaca `TenantContext` dari ekstensi permintaan.

## Status Verifikasi

- `passed` — Tiga uji unit Rust lulus.
- `passed` — Uji integrasi `cm02_context` lulus pada PostgreSQL 18.7 sementara dengan skema proyek. Uji mencakup akses perusahaan dan area yang sah, penolakan lintas perusahaan, area tanpa akses, pencabutan keanggotaan, izin efektif, serta klaim izin terbatas atau hilang.
- `not run` — Berkas `osc_docs/test_flows/CM02-F.py` belum tersedia.
