# MP-CM01-FE — Login multi-company

Halaman `/login` memuat perusahaan aktif melalui BFF, meminta kredensial, dan membuka modal TOTP jika backend mengirim `mfa_required`. Setelah autentikasi selesai, halaman menampilkan perusahaan aktif dari pilihan pengguna dan pemberitahuan jika backend mengaktifkan `warning_flag`.

BFF menggunakan `INTERNAL_API_URL` untuk mengakses `/baas/v1/public/companies`, `/api/v1/auth/login`, dan `/api/v1/auth/mfa/verify`. Variabel `APP_ORIGIN` menentukan origin publik aplikasi untuk pemeriksaan permintaan login dan MFA. Gunakan origin HTTPS pada produksi agar cookie sesi beratribut `Secure`.

## Objektif

Menyediakan login berbasis perusahaan, verifikasi TOTP, dan pemberitahuan Mode Pemulihan pada frontend.

## Scope/Keputusan

Perubahan berada di `osc_site`. BFF menerjemahkan respons autentikasi Rust menjadi status untuk UI dan menyimpan token sesi serta challenge MFA dalam cookie HttpOnly. Pemilihan perusahaan menggunakan nama dan mendukung pencarian lewat keyboard. Setelah login, halaman menampilkan konfirmasi dan menyimpan pilihan perusahaan dalam TenantContext.

## Hasil Eksekusi

Halaman login, modal TOTP enam digit, BFF, dan toast pemulihan tersedia. Pengguna dapat memuat ulang daftar perusahaan saat layanan gagal, memperbaiki OTP, atau kembali ke login untuk memulai verifikasi baru.

## Status Verifikasi

- `passed` — Build produksi Next.js melalui `npm run build`, termasuk pemeriksaan TypeScript.
- `passed` — Chromium pada lebar 360 piksel dengan backend simulasi. Pengujian mencakup pemuatan ulang daftar, penyaringan perusahaan nonaktif, pemilihan dengan keyboard, penolakan OTP, OTP berawalan nol, cookie sesi HttpOnly, serta toast pemulihan setelah verifikasi.
- `passed` — Chromium pada lebar 1280 piksel dengan backend simulasi. Login langsung menghasilkan cookie sesi HttpOnly dan konfirmasi tanpa toast pemulihan.
- `not run` — Integrasi langsung dengan layanan Rust, basis data, dan HRIS. Endpoint daftar perusahaan mengikuti path healthcheck pada Docker Compose.
