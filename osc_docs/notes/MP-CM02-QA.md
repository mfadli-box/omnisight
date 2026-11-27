# MP-CM02-QA — Isolasi tenant

## Objektif

Menguji konteks perusahaan dan area, penolakan lintas tenant, serta kesiapan RLS pada CM02.

## Scope/Keputusan

Suite memakai server backend nyata dan fixture database terisolasi melalui `cm01_support.py`. JWT dan data fixture dibuat acak saat runtime. Pemeriksaan RLS memeriksa aktivasi dan keberadaan kebijakan pada `dat_area`; pemeriksaan ini belum membuktikan isolasi baris saat query. Endpoint yang tersedia hanya mengembalikan konteks tenant, sehingga isolasi hasil query daftar data belum dapat diuji.

## Hasil Eksekusi

Dibuat dua skenario fungsional dan empat skenario keamanan, termasuk perusahaan lain, area lain, area tanpa grant, selector ganda, serta izin baca yang dicabut. Pencarian pada `osc_base/init` tidak menemukan aktivasi RLS atau `CREATE POLICY`; kriteria perlindungan RLS belum dapat dinyatakan terpenuhi. Kedua suite berhenti pada setup karena database uji belum dikonfigurasi. `psycopg` juga belum tersedia pada Python sistem. Container PostgreSQL yang sedang berjalan tidak digunakan sebagai database uji karena belum dipastikan terisolasi.

## Status Verifikasi

- `passed`: `python3 -m py_compile` untuk kedua suite dan fixture.
- `not run`: seluruh skenario integrasi; tidak ada test yang dijalankan karena setup gagal. Kriteria 100% PASSED belum terpenuhi.

## Menjalankan ulang

Siapkan database PostgreSQL kosong khusus uji dengan skema `osc_base/init`, instal `psycopg` versi 3 dan `argon2-cffi`, serta build binary backend. Pastikan port 8080 tersedia. Set `CM01_TEST_DATABASE_URL` secara aman dan `CM01_DISPOSABLE_DATABASE=yes`, lalu jalankan `python3 -m unittest osc_docs/test_flows/CM02-F.py` dan `python3 -m unittest osc_docs/test_guard/CM02-G.py`. Jangan gunakan database produksi atau menulis URL database dalam repositori. Setelah kebijakan RLS tersedia, tambahkan uji query langsung menggunakan role aplikasi tanpa `BYPASSRLS` untuk membuktikan isolasi baris.
