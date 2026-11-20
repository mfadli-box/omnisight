# Fondasi API dan autentikasi OmniSight

## Tujuan dan hasil

Backend Axum memakai Tokio, pool SQLx PostgreSQL, Valkey, dan klien S3 RustFS. Request terlindungi memakai company dan daftar area dari JWT tervalidasi sebagai konteks lokal transaksi PostgreSQL. Read model perusahaan dan use case autentikasi memakai port aplikasi. Kriptografi dan penandatanganan sesi berada di lapisan aplikasi. MFA memakai `totp-rs` dan menyimpan langkah terakhir untuk mencegah replay. Handler MFA membaca klaim dari konteks tenant middleware. Seed enrollment terenkripsi disimpan sementara di Valkey, lalu disimpan permanen di PostgreSQL setelah OTP diverifikasi.

- `GET /baas/v1/health` tersedia untuk pemeriksaan liveness. `GET /baas/v1/public/companies` hanya mengembalikan ID, kode, dan nama perusahaan aktif.
- `POST /baas/v1/auth/login` menerima company kosong atau perusahaan `LOCAL` untuk login akun lokal dengan Argon2id. Valkey membatasi 20 percobaan per nama pengguna dalam 60 detik.
- HRIS memakai template URL dengan host persis dari allowlist. GET dibatasi 5 detik dan 64 KiB, dengan proxy dan redirect dinonaktifkan. Decoder XML menolak DTD. Diagnostik jaringan tidak mencatat URL yang memuat kredensial.
- Respons sukses HRIS melakukan upsert profil beserta verifier Argon2id dan waktu sinkronisasi. Username global mengikat verifier HRIS ke perusahaan asal. Akun lama tanpa perusahaan asal hanya dapat dipakai untuk satu perusahaan HRIS yang sesuai grant. Penerbitan sesi memerlukan grant aktif. Respons `0|...|NONE` menghasilkan `401`.
- Lima kegagalan upstream dalam jendela 30 detik membuka circuit tenant selama 60 detik. Fallback memeriksa cakupan perusahaan, umur cache, dan password. Keberhasilan menulis `LOGIN_HRIS_OFFLINE_CACHE` ke audit log. Cache kedaluwarsa menghasilkan `502`.
- Dockerfile membangun biner dengan `Cargo.lock` di tahap builder dan menjalankan biner sebagai UID 10001 di tahap runtime.

## Menjalankan

Terapkan migrasi database dari [catatan fondasi database](../../osc_base/notes/20261120-core-01-base.md), lalu gunakan variabel layanan yang tercantum di [README backend](../README.md).

## Verifikasi

- `cargo check --locked --offline --all-targets` dan `cargo fmt --check` lulus.
- Tiga unit test Rust lulus. Cakupannya validasi host HRIS, decoding XML, batas ukuran, dan verifikasi TOTP serta replay.
- Build Docker multi-stage lulus. Biner release dengan perbaikan enrollment dibangun ulang dari tahap builder dan diverifikasi pada runtime non-root.
- Smoke test dengan PostgreSQL 18.7, Valkey, RustFS dan HRIS tiruan lulus. Cakupannya rute publik, login lokal dan HRIS, navigasi dengan JWT/RLS, isolasi arsip antartenant, unggah dan unduh arsip RustFS, batas laju, ambang dan TTL breaker, audit fallback, cache kedaluwarsa, timeout, respons XML yang ditolak, serta redaksi log.
- Uji HTTP enrollment, challenge, verifikasi TOTP, dan penolakan replay lulus setelah perbaikan konteks middleware dan penyimpanan seed.
