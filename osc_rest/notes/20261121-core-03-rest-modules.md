# REST modul inti XX00

## Tujuan

Melengkapi API Axum untuk alur autentikasi TOTP, perpindahan konteks perusahaan, navigasi menu, dan operasi modul inti. Implementasi memakai skema PostgreSQL inti dan role runtime yang sudah tersedia.

## Kontrak API

Semua path berikut relatif terhadap `/baas/v1`. Respons JSON memakai envelope `data` dan `meta`. Daftar CRUD menerima `limit` (1–200, bawaan 50) dan `offset`. Mutasi menerima JSON berisi field yang diizinkan. Identitas tenant berasal dari sesi.

| Modul | Rute | Perilaku |
| --- | --- | --- |
| Auth | `POST /auth/login`, `/auth/mfa/{setup,enable,verify,disable,reset-request,reset-confirm}`, `POST /users/{id}/mfa/reset` | Login dengan MFA aktif menerbitkan challenge JWT lima menit. TOTP menerima ±1 langkah 30 detik dan menolak langkah yang sudah tercatat. Valkey membatasi lima percobaan gagal per pengguna selama 15 menit. Reset email mengikat tautan sekali pakai ke pendaftaran MFA yang aktif saat tautan diterbitkan. |
| Konteks | `POST /auth/switch-company`, `GET /me/navigation` | Switch menerima `company_id` dan opsional `area_id`. JWT dan respons memuat area yang efektif. Navigasi tetap berupa daftar modul dengan `group_code`, `group_name`, kode modul, label, path, ikon, dan urutan. |
| CT01 | `GET, POST /nodes`, `GET, PATCH, DELETE /nodes/{id}` | Node dibuat dengan `store_id` dan `os_type`. Area diturunkan dari store aktif. Seed demo memberi CT01 izin baca. Mutasi membutuhkan grant dan entitlement aksi terkait. |
| OP01 | `GET, POST /pam/targets`, `GET, PATCH, DELETE /pam/targets/{id}`, `POST /pam/sessions/authorize` | Target dibuat dengan kode, nama, hostname, port, protokol, dan cakupan area. Otorisasi menerima `target_id`, `requested_reason` (alias `reason`), serta `otp` bila sesi perlu step-up. MFA wajib dan bukti step-up terikat pada sesi dengan usia maksimal 15 menit. Sesi PAM berstatus `AUTHORIZED` berlaku satu jam. Penghapusan target yang dirujuk sesi menghasilkan konflik. |
| KB01 | `GET, POST /sop-documents`, `GET, PATCH, DELETE /sop-documents/{id}`, `POST, GET /sop-documents/{id}/attachment` | Buat dengan `document_code`, `title`, dan opsional `markdown_content`, `area_id`. Penghapusan mengarsipkan dokumen. Lampiran PDF, DOCX, atau teks memakai body mentah maksimal 20 MiB dan penyimpanan RustFS privat. Alias `/sop/documents` tetap tersedia. |
| RP01 / RP02 | `GET /reports/export-excel/{table_name}`, `POST /reports/generate-pdf`, `GET /reports/archives/{id}` | PDF menerima `table_name`. Sumber yang didukung ialah `osc_agent_node`, `osc_sop_document`, `osc_pam_session`, dan `osc_activity_log`. Izin view sumber dan izin format diperiksa pada cakupan aktif. XLSX memuat hingga 5.000 baris dan PDF hingga 500 baris. Header `X-Report-Archive-Id` menunjuk arsip privat pemilik. |
| SA01 | `GET, POST /companies`, `/areas`, `/stores` dan `GET, PATCH, DELETE` pada masing-masing `/{id}` | Akses company-wide diperlukan untuk membuat perusahaan atau area. Perusahaan baru menerima grant pendiri berdasarkan role company-wide aktor. Area dengan grant atau store aktif dan perusahaan tanpa alternatif administrasi aktif dilindungi dari penonaktifan. |
| SA02 | `GET, POST /users`, `GET, PATCH, DELETE /users/{id}` | Buat akun lokal dengan `username`, `full_name`, `password`, `role_id`, dan opsional `email`, `area_id`. PATCH mendukung nama dan email. Role yang didelegasikan dibatasi izin efektif aktor, dan perubahan identitas bersama lintas perusahaan ditolak. |
| SA03 | `GET /audit-logs`, `GET, POST /roles`, `GET /company-menus`, `PUT /company-menus/{role_id}/{menu}` | Audit tersedia untuk dibaca sesuai cakupan. Pengubahan grant role memerlukan MFA terbaru, menolak pemberian hak di atas aktor, dan merekam konfigurasi sebelum dan sesudah ke audit. |
| SA04 | `GET, PATCH /companies/{id}/connector` | PATCH mengatur `LOCAL` atau `HRIS_ASMX`, URL template yang lolos allowlist, dan TTL cache HRIS. Perubahan memerlukan MFA terbaru. Respons menyamarkan URL konektor. |

Pemeriksaan aksi menggabungkan grant pengguna, role aktif, `osc_company_menu`, entitlement perusahaan, serta tenant dan area. Mutasi dan jejak audit terkait berjalan dalam transaksi PostgreSQL. Artefak RustFS dibersihkan ketika request di-rollback setelah upload berhasil. Objek lama dan upload dengan hasil commit yang tidak diketahui tetap mengikuti retensi storage.

## Verifikasi

- `cargo fmt --check`, `cargo check --offline`, `cargo test --offline`, dan `git diff --check`.
- Smoke test HTTP dengan PostgreSQL 18, Valkey, RustFS, dan server email HTTPS fixture. Cakupan mencakup CRUD dan pembatasan lintas tenant, switch dan navigasi, PAM dengan step-up terikat sesi, alur MFA dan pemulihan, round trip lampiran, pemisahan izin RP01/RP02, struktur file XLSX/PDF, serta unduhan arsip.
