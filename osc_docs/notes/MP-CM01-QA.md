# MP-CM01-QA

## Objektif
Menyusun dan menjalankan pengujian fungsional serta keamanan autentikasi CM01.

## Scope/Keputusan
Suite menggunakan server backend nyata, database PostgreSQL khusus uji dan HRIS tiruan lokal. Nilai kredensial, kunci JWT dan secret TOTP dibuat acak saat runtime. Pengujian menolak berjalan tanpa `CM01_DISPOSABLE_DATABASE=yes` dan `CM01_TEST_DATABASE_URL` karena membuat dan menghapus data fixture. Gunakan hanya database terisolasi yang telah menerapkan skema `osc_base/init` dan jangan gunakan data produksi. Port 8080 harus tersedia. Dependensi Python: `psycopg` versi 3 dan `argon2-cffi`.

## Hasil Eksekusi
Disusun tujuh skenario fungsional dan tiga pemeriksaan keamanan. Cargo unit test backend dijalankan: 3 passed, termasuk parsing XML dan logika fallback/penolakan. Percobaan kedua suite Python berhenti pada setup karena database uji belum dikonfigurasi; tidak ada skenario integrasi yang dijalankan. Docker dapat diakses dengan eskalasi tetapi tidak ditemukan container PostgreSQL yang berjalan; dependensi Python tersebut juga belum terpasang. Kriteria 100% PASSED belum terpenuhi.

## Status Verifikasi
- `passed`: `python3 -m py_compile` untuk berkas suite; `cargo test --offline --manifest-path osc_rest/Cargo.toml --lib` (3 passed).
- `not run`: seluruh skenario integrasi fungsional dan keamanan, karena prasyarat database uji dan dependensi belum tersedia.

## Menjalankan ulang
Siapkan database PostgreSQL kosong yang terisolasi dengan skema proyek, instal dependensi Python, lalu jalankan `cargo build --manifest-path osc_rest/Cargo.toml`. Set `CM01_TEST_DATABASE_URL` melalui environment secara aman dan `CM01_DISPOSABLE_DATABASE=yes`, kemudian jalankan `python3 -m unittest osc_docs/test_flows/CM01-F.py` dan `python3 -m unittest osc_docs/test_guard/CM01-G.py`. Jangan mencatat URL database atau nilai rahasia dalam file repositori.
