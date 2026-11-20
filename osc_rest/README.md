# osc_rest

Kerangka layanan Rust Axum dengan batas Clean Architecture:

- `src/domain`: model identitas/konteks dan error aplikasi yang aman.
- `src/application`: use case autentikasi dan MFA, penandatanganan sesi, Argon2id, AES-GCM, dan TOTP.
- `src/infrastructure`: adapter PostgreSQL, Valkey, HRIS HTTP/XML, RustFS S3, dan email.
- `src/presentation`: rute Axum, validasi DTO, middleware sesi, dan pemetaan error.

## Konfigurasi wajib

- `DATABASE_URL` adalah koneksi PostgreSQL 18 untuk role API. Terapkan fondasi database dari koneksi administrator sesuai [catatan migrasi](../osc_base/notes/20261120-core-01-base.md).
- `POSTGRES_APP_PASSWORD`: Compose membuat role non-superuser `omnisight_app` hanya saat volume PostgreSQL dibuat pertama kali. Jika volume basis data sudah ada, buat role itu dan berikan membership pada `osc_app_runtime` melalui proses migrasi/administrasi. Lakukan URL-encode untuk karakter khusus pada kata sandi URL basis data.
- `CACHE_URL` adalah URL Valkey untuk pembatas laju login, circuit breaker HRIS, dan status sesi. Login mengembalikan `503` saat Valkey tidak tersedia.
- `JWT_SECRET`: minimal 32 byte acak, disimpan di pengelola rahasia deployment.
- `MFA_ENCRYPTION_KEY`: encoding base64/base64url dari tepat 32 byte acak. Simpan di luar PostgreSQL dan rotasi melalui rencana migrasi versi envelope yang eksplisit.
- `HRIS_ALLOWED_HOSTS`: nama host DNS intranet persis, dipisahkan koma (tanpa wildcard atau literal IP). Redirect dinonaktifkan; hanya port 80/443 yang diterima.
- `EMAIL_API_ENDPOINT`, `EMAIL_API_TOKEN`, `PUBLIC_APP_URL`: wajib untuk pengiriman reset MFA melalui email. Layanan HTTPS yang dikonfigurasi harus menerima JSON `{to, subject, text}` dan endpoint-nya harus dikelola operator. Tanpa ini, reset-request mengembalikan dependency unavailable.
- `BIND_ADDR`: opsional, nilai bawaan `0.0.0.0:8080`.
- `RUSTFS_ENDPOINT`, `RUSTFS_BUCKET`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`, `RUSTFS_REGION`: target RustFS privat yang kompatibel dengan S3. Layanan membuat bucket jika belum ada dan gagal saat startup bila storage tidak tersedia atau kredensial tidak dapat mengakses/membuat bucket.

Template HRIS memakai URL HTTP(S) absolut dengan host dalam `HRIS_ALLOWED_HOSTS` serta placeholder `{U}` dan `{P}` di path atau query. API memakai HTTP GET dengan batas waktu 5 detik dan respons maksimal 64 KiB. Sukses memakai teks `1|username|full_name|email` di dalam `<string xmlns="...">...</string>`. Penolakan `0|...|NONE` menghasilkan `401`.

Login tanpa `company_id` atau dengan perusahaan `LOCAL` memverifikasi akun lokal memakai Argon2id. Sinkronisasi HRIS mengikat verifier ke perusahaan asal. Sesi HRIS tetap membutuhkan grant aktif. Lima kegagalan upstream dalam 30 detik membuka circuit selama 60 detik. Saat upstream gagal atau circuit terbuka, password yang cocok dengan cache HRIS aktif dalam TTL menghasilkan audit `LOGIN_HRIS_OFFLINE_CACHE`. Cache kedaluwarsa menghasilkan `502`. Valkey membatasi percobaan login menjadi 20 per nama pengguna per 60 detik.

Login perusahaan saat ini hanya mengimplementasikan `LOCAL` dan `HRIS_ASMX`. `LDAP_AD` dan `M365_OIDC` dikenali pada skema tetapi ditolak secara aman dengan `501 AUTH_PROVIDER_UNSUPPORTED` sampai adapter-nya tersedia.

Token akses sesi berlaku 15 menit. Pencabutan sesi pemulihan menggunakan watermark waktu terbit per pengguna di Valkey; bila Valkey gagal, endpoint terlindungi menolak secara aman. API mengembalikan token kepada pemanggil BFF tepercaya; BFF untuk browser harus menetapkan cookie `HttpOnly; Secure; SameSite=Strict` dan tidak mengekspos token ke JavaScript browser.

## Rute yang tersedia

- `GET /baas/v1/health` untuk liveness. `/health` juga tersedia.
- `GET /baas/v1/public/companies` mengembalikan `data` berisi `id`, `code`, dan `name` dari perusahaan aktif.
- `POST /baas/v1/auth/login`
- `POST /baas/v1/auth/mfa/setup`, `/enable`, `/verify`, `/disable`
- `POST /baas/v1/auth/mfa/reset-request`, `/reset-confirm`
- `POST /baas/v1/users/{user_id}/mfa/reset`
- `POST /baas/v1/auth/switch-company`, `GET /baas/v1/me/navigation`
- `POST /baas/v1/pam/sessions/authorize` (`OP01` create; MFA wajib dan step-up setelah 15 menit)
- `POST/GET /baas/v1/sop-documents/{document_id}/attachment` (`KB01`; maksimal 20 MiB; PDF, DOCX, atau teks biasa). Alias `/sop/documents` juga tersedia.
- `GET /baas/v1/reports/export-excel/{table_name}` (`RP01` view+create; allowlist: `osc_sop_document`, `osc_pam_session`, `osc_agent_node`, `osc_activity_log`)
- `POST /baas/v1/reports/generate-pdf` (`RP02`) dan `GET /baas/v1/reports/archives/{archive_id}` (izin sesuai format dan sumber; arsip privat dan dibatasi tenant).
- CRUD serta administrasi tenant dijelaskan dalam [kontrak REST modul inti](notes/20261120-core-03-rest-modules.md).

Reset-request sengaja mengembalikan respons generik untuk akun yang tidak dikenal. Integrasi email yang dikelola operator diperlukan untuk pengiriman reset. Konfigurasi endpoint HRIS yang tidak valid tidak pernah memicu fallback offline; gangguan jaringan/respons tidak valid hanya boleh memakai cache lokal HRIS yang masih berlaku. Isi respons/log tidak menyertakan URL lengkap, `uPaswd`, isi XML, kata sandi, OTP, backup code, atau token.

## RLS dan role basis data

Resolver login/konteks membutuhkan akses berparameter ke tabel kontrol identitas, perusahaan, dan grant sebelum tenant diketahui. Tabel ini memang berada di luar RLS; tabel tersebut tidak boleh tersedia melalui API query klien generik. Tabel transaksi bisnis memakai RLS. JWT sesi memakai klaim `user_id`, `active_company_id`, dan `active_area_ids` (decoder menerima alias lama `sub`, `company_id`, dan `allowed_area_ids`). Request terlindungi menetapkan `app.current_company_id` dan `app.allowed_area_ids` di dalam transaksi PostgreSQL per request. Daftar area memakai UUID yang dipisahkan koma atau `{}` jika kosong. Role basis data aplikasi harus terpisah dari pemilik migrasi/tabel, tidak boleh memiliki tabel RLS, dan tidak boleh memiliki `BYPASSRLS` atau hak superuser.

Seed `001_seed_demo.sql` menyediakan akun lokal `admin` untuk database pengembangan. Untuk produksi, provision akun awal dan hash Argon2id melalui proses bootstrap tepercaya.
