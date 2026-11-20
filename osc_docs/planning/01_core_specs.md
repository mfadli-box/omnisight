# Spesifikasi Teknis Inti OmniSight

| Item | Rincian |
|---|---|
| Status | Usulan kontrak API/data; versi 1; bukan pernyataan implementasi |
| Awalan API | `/baas/v1` |
| Pemilik utama | ai-base, ai-rest, ai-site, ai-auto; koordinasi ai-main |
| Sikap keamanan | Tolak secara default, batasi per tenant, dapat diaudit, tanpa secret pada keluaran yang terlihat klien |

## 1. Konvensi kontrak

- Gunakan HTTPS di semua lingkungan non-lokal. Request/respons memakai JSON, kecuali endpoint memindahkan byte berkas atau mengembalikan berkas hasil.
- Tabel rute di bawah menuliskan path relatif terhadap awalan API. Contoh, `POST /auth/login` berarti `POST /baas/v1/auth/login`; semua rute berada di bawah versi `/baas/v1`.
- Identifier path berupa UUID kecuali dinyatakan lain. Timestamp memakai UTC RFC 3339. ID dan enum menggunakan representasi stabil yang terdokumentasi.
- Amplop sukses JSON: `{ "data": ..., "meta": { "request_id": "..." } }`. Respons biner memakai content type dan `Content-Disposition` yang terdokumentasi; jangan bungkus byte biner dalam JSON.
- Amplop error: `{ "error": { "code": "...", "message": "...", "details": {} }, "meta": { "request_id": "..." } }`. `message` aman untuk klien; `details` tidak boleh berisi secret, SQL, stack trace, body respons HRIS, atau URL internal.
- Gunakan `401` untuk autentikasi yang hilang/tidak valid/kedaluwarsa, `403` untuk pengguna terautentikasi yang tidak berhak atau MFA wajib, `404` untuk objek tidak ada/di luar cakupan bila keberadaannya perlu disembunyikan, `409` untuk konflik state/idempotensi, `413` untuk payload melewati batas, `422` untuk JSON valid dengan nilai domain tidak valid, `429` untuk pembatasan laju, `502` untuk respons HRIS tidak valid/tidak tersedia tanpa fallback offline sah, dan `503` untuk dependensi/layanan tidak tersedia.
- Request terautentikasi memakai cookie sesi browser melalui BFF atau `Authorization: Bearer <access_token>` untuk klien layanan/API. Jangan taruh kredensial/token pada parameter query.
- Request mutasi menerima `Idempotency-Key` bila pengulangan dapat menggandakan efek (reset MFA, authorize PAM, pembuatan laporan, pengiriman job agent). Mutasi sensitif memerlukan konteks audit.
- Gunakan pagination berbasis cursor untuk koleksi telemetri/audit besar; batasi ukuran halaman. Setiap query daftar menyaring tenant sebelum pagination/agregasi.

## 2. Principal, konteks tenant, dan otorisasi

Principal yang sudah di-resolve berisi `user_id` atau `agent_node_id`, `company_id`, `area_id` terpilih (nullable hanya untuk akses seluruh perusahaan), `allowed_area_ids`, role, izin modul, status/waktu verifikasi MFA, dan request ID. Nilai company/area dari klien adalah usulan untuk divalidasi, bukan klaim otorisasi. Backend memvalidasi membership aktif dan memasukkan konteks tervalidasi ke konteks RLS PostgreSQL yang berlaku hanya dalam transaksi.

Operasi terlindungi hanya boleh diberikan bila seluruh syarat berikut terpenuhi:

1. Identitas/sesi valid dan principal aktif.
2. Company dan relasi area/store terkait berstatus aktif.
3. Grant akses efektif untuk company dan area terpilih.
4. Aksi modul yang diwajibkan (`can_view`, `can_create`, `can_update`, atau `can_delete`).
5. PostgreSQL RLS mengizinkan baris sasaran dan semua baris terkait.
6. Kontrol domain tambahan terpenuhi, misalnya MFA step-up untuk PAM atau kepemilikan/status persetujuan SOP.

Objek di luar cakupan tenant/area principal umumnya sebaiknya menghasilkan `404` untuk mengurangi percobaan menebak identifier. Akses lintas tenant tidak boleh berhasil karena pemanggil menebak UUID atau mengirim `company_id` lain di body.

## 3. Kontrak endpoint API

### Autentikasi dan siklus hidup sesi

| Metode dan rute | Request | Sukses | Akses dan error penting |
|---|---|---|---|
| `POST /auth/login` | `{ "company_id": "uuid|null", "username": "...", "password": "...", "backup_code": "opsional" }` | `{ "data": { "access_token": "...", "expires_in": 900, "mfa_required": false, "mfa_challenge_token": null, "user": {...}, "available_contexts": [...] } }` | Publik tetapi dibatasi laju; company tidak ada atau URL HRIS kosong memakai Argon2id lokal. Jalur HRIS memakai allowlist host dan parser XML terbatas. `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`, `502 HRIS_UPSTREAM_INVALID_RESPONSE`. Jika MFA aktif dan backup code tidak diberikan, kembalikan `mfa_required:true` dan challenge `scope=mfa_pending` berumur 5 menit; jangan terbitkan sesi penuh. Pengiriman token ke browser harus melalui cookie HttpOnly BFF. |
| `POST /auth/refresh` | Cookie refresh atau kredensial refresh sisi server | Token/sesi dan masa berlaku baru | Alur refresh terautentikasi; rotasi/cabut kredensial refresh, tolak replay. `401 SESSION_EXPIRED` |
| `POST /auth/logout` | Kosong | `{ "data": { "logged_out": true } }` | Terautentikasi; cabut refresh/sesi aktif dan hapus cookie BFF. Idempoten. |
| `POST /auth/switch-company` | `{ "company_id": "uuid", "area_id": "uuid|null" }` | Konteks sesi baru dan navigasi yang diizinkan | Memerlukan sesi aktif; validasi grant tujuan dan hierarki aktif; terbitkan token dengan konteks baru. `403 CONTEXT_NOT_GRANTED`, `404 CONTEXT_INACTIVE`. |
| `GET /me` | Tidak ada | Profil pengguna, konteks bawaan/saat ini, konteks tersedia, status MFA | Terautentikasi; jangan kembalikan hash kata sandi, secret MFA, atau hash backup code. |
| `GET /me/navigation` | Tidak ada | Grup berhak dan metadata modul yang terlihat | Terautentikasi; filter navigasi memakai `can_view`, tetapi navigasi bukan pengganti otorisasi. |

Aturan login HRIS: jalur lokal bila company tidak diberikan atau URL HRIS kosong. Untuk HRIS yang dikonfigurasi, allowlist endpoint host/skema/port; tetapkan timeout koneksi/baca yang ketat; batasi total respons 64 KiB; larang redirect yang tidak aman; parse XML dengan DTD/entitas eksternal dinonaktifkan. Jangan pernah mencatat nilai username/password pada query atau body respons. Saat upstream timeout/respons tidak valid/circuit OPEN, fallback Argon2id lokal hanya boleh jika sinkronisasi HRIS sebelumnya masih dalam `hris_cache_ttl_hours`. Catat audit `LOGIN_HRIS_OFFLINE_CACHE`. Jika fallback tidak dapat memverifikasi, kembalikan `502` sesuai kontrak; jangan menerima kredensial lokal di luar kebijakan cache.

### MFA

| Metode dan rute | Request | Sukses | Akses dan error penting |
|---|---|---|---|
| `POST /auth/mfa/setup` | Opsional autentikasi ulang kata sandi saat ini | URI provisioning/payload QR satu kali, secret tidak dicatat | Sesi terautentikasi non-pending; secret hanya dikembalikan untuk transport enrollment dan dienkripsi saat disimpan. Ada pembatasan laju. |
| `POST /auth/mfa/enable` | `{ "otp": "6 digit" }` | MFA aktif dan backup code satu kali | Terautentikasi; wajib TOTP valid. Simpan hanya hash backup code Argon2id. `422 INVALID_OTP`, `409 MFA_ALREADY_ENABLED`. |
| `POST /auth/mfa/verify` | `{ "mfa_challenge_token": "...", "otp": "6 digit" }` | Sesi/token penuh dan konteks terpilih | Wajib challenge pending berumur pendek; toleransi ±1 langkah 30 detik, tolak langkah yang sudah/lama dipakai secara atomik melalui `mfa_last_verified_step`; maksimal 5 kegagalan dalam jendela kebijakan. `401 MFA_CHALLENGE_INVALID`, `429 MFA_RATE_LIMITED`, `409 TOTP_REPLAY`. |
| `POST /auth/mfa/disable` | `{ "password": "...", "otp": "..." }` | MFA dinonaktifkan dan sesi dirotasi/dicabut sesuai kebijakan | Autentikasi ulang + step-up; diaudit. Jangan izinkan token challenge pending menonaktifkan MFA. |
| `POST /auth/mfa/reset-request` | `{ "email": "..." }` | Respons generik diterima | Cegah enumerasi akun. Buat alur reset email terverifikasi, berumur pendek, sekali pakai, dan dibatasi laju. |
| `POST /auth/mfa/reset-confirm` | `{ "token": "..." }` | MFA direset dan semua sesi aktif dicabut | Token sekali pakai, berumur pendek, terikat ke pengguna, dan diaudit. |
| `POST /users/{user_id}/mfa/reset` | `{ "reason": "..." }` | Konfirmasi reset | Tindakan admin dengan izin eksplisit, MFA step-up, alasan, dan audit `MFA_RESET`. |

Semantik login/reset dengan backup code harus memiliki satu alur eksplisit: konsumsi satu backup code secara atomik, tandai tidak dapat digunakan lagi, nonaktifkan MFA jika itu jalur pemulihan mandiri yang disetujui, cabut sesi sesuai kebijakan, lalu terbitkan sesi baru hanya setelah challenge pemulihan selesai. Jangan izinkan replay backup code atau mengembalikan kode teks biasa di kemudian hari.

### PAM Bastion

| Metode dan rute | Request | Sukses | Akses dan error penting |
|---|---|---|---|
| `POST /pam/sessions/authorize` | `{ "target_id": "uuid", "requested_reason": "...", "otp": "opsional" }` | `{ "data": { "session_id": "uuid", "state": "authorized", "expires_at": "..." } }` | Memerlukan izin create `OP01`, target aktif dalam tenant/area terpilih, dan MFA aktif. Jika MFA nonaktif, `403 MFA_REQUIRED_FOR_PAM`. Jika verifikasi terakhir >15 menit, wajib OTP step-up; jika tidak, `403 MFA_STEP_UP_REQUIRED`. Validasi kebijakan target dan audit. |
| `GET /pam/sessions/{session_id}` | Tidak ada | Status dan timestamp sesi dalam cakupan | Izin view `OP01`; jangan pernah mengembalikan secret/bahan kredensial. |
| `POST /pam/sessions/{session_id}/close` | `{ "reason": "opsional" }` | State tertutup | Izin update `OP01` atau kebijakan operator/pemilik sesi yang disetujui; idempoten dan diaudit. |

Otorisasi hanya membuat catatan sesi PAM/keputusan otorisasi terkontrol. Broker kredensial, proxy terminal, perekaman, konektivitas target, dan pencabutan memerlukan protokol serta spesifikasi model ancaman terpisah; usulan API ini tidak menyatakan fungsi-fungsi tersebut sudah diimplementasikan.

### SOP dan object storage

| Metode dan rute | Request | Sukses | Akses dan error penting |
|---|---|---|---|
| `POST /sop/documents` | Metadata JSON: judul, kategori, cakupan area, field persetujuan | Metadata dokumen draf | Izin create `KB01`; tenant/area diturunkan dari konteks atau divalidasi; audit. |
| `POST /sop/documents/{id}/attachments` | Berkas multipart atau body stream terbatas | Metadata lampiran + ID berkas opaque | Izin update `KB01`; verifikasi cakupan dokumen; allowlist ukuran/MIME, pemeriksaan konten, object key buatan sistem, checksum, RustFS privat. `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`. |
| `GET /sop/documents/{id}/attachments/{file_id}` | Tidak ada | Stream terotorisasi atau presigned URL berumur pendek | Izin view `KB01` dan pemeriksaan ulang cakupan RLS; masa URL dan `Content-Disposition` dibatasi; bucket tidak publik. |
| `POST /sop/documents/{id}/submit` | Ringkasan perubahan opsional | `approval_status=pending` | Izin update `KB01`; validasi metadata wajib dan transisi audit. |

Simpan object key dan pemetaan metadata di PostgreSQL; siklus hidup objek, enkripsi, backup, retensi, pembersihan objek yatim, dan pemindaian malware masih menjadi keputusan infrastruktur. Upload objek yang gagal tidak boleh meninggalkan metadata dokumen seolah sudah selesai; gunakan alur kompensasi/outbox jika transaksi basis data dan object storage tidak dapat disatukan.

### Laporan

| Metode dan rute | Request | Sukses | Akses dan error penting |
|---|---|---|---|
| `GET /reports/export-excel/{table_name}` | Filter query yang diizinkan, cursor/limit, kolom yang diminta | Stream `.xlsx` atau job ekspor asinkron terbatas | Privilege view/export `RP01` dan allowlist tabel/kolom. Jangan menerima SQL, nama skema arbitrer, atau filter lintas tenant tanpa batas. Audit ekspor. |
| `POST /reports/generate-pdf` | `{ "template_id": "uuid", "filters": {...}, "format": "pdf" }` | ID job `202` atau stream PDF kecil | Izin create `RP02`; template dan baris dibatasi principal; sanitasi input template; output dan eksekusi dibatasi; audit pembuatan/unduhan. |
| `GET /reports/jobs/{job_id}` | Tidak ada | Status job/metadata unduhan | Izin view `RP02` dan cakupan tenant; unduhan memakai kontrol akses storage yang sama. |

Ekspor adalah jalur eksfiltrasi data: tegakkan privasi baris/kolom, batas hasil, timeout, audit aktor/konteks, dan larang akses ke tabel internal/sistem. Ekspor yang terlalu besar sebaiknya diproses asinkron dengan retensi/kedaluwarsa, bukan menahan worker request terlalu lama.

### Agent, telemetri, dan penjadwalan

| Metode dan rute | Request | Sukses | Akses dan error penting |
|---|---|---|---|
| `POST /agent/v1/enroll` | Kredensial bootstrap sekali pakai, identitas node, klaim store | Identitas/sertifikat atau kredensial node | Alur enrollment terisolasi; bootstrap sekali pakai/berumur pendek, kebijakan persetujuan, pengikatan store; secret hanya ditampilkan sekali. |
| `POST /agent/v1/heartbeat` | Identitas node, timestamp, sequence monotonik, metrik OS/CPU/RAM/disk/uptime, tanda tangan | Sequence diterima dan waktu server | mTLS atau kredensial node bertanda tangan; ikat node ke store aktif; tolak sequence lama/replay; validasi rentang/ukuran; tanpa label/perintah arbitrer. |
| `POST /agent/v1/jobs/claim` | Identitas node, kapabilitas yang didukung, tanda tangan | Lease dan deskripsi job bertanda tangan atau kosong | Hanya job untuk node/store terkait; lease kedaluwarsa; payload berisi identifier perintah dari allowlist terdaftar, skema args, nonce, expiry, audience, job ID, dan HMAC. |
| `POST /agent/v1/jobs/{job_id}/result` | Lease ID, hasil, output terbatas/referensi log, tanda tangan | Status terminal/lanjutan diterima | Verifikasi lease, identitas node, HMAC, dan idempotensi; sanitasi output; kirim log besar melalui alur upload terkontrol. |

Autentikasi telemetri agent dan HMAC job adalah kontrol terpisah. Kunci HMAC memerlukan provisioning aman, isolasi per node, dan rotasi. HMAC tidak memberi kerahasiaan; gunakan TLS/mTLS. Allowlist job berada secara lokal di agent dan tidak dapat dilonggarkan oleh job bertanda tangan dari server.

### Metadata administrasi dan otorisasi

| Metode dan rute | Tujuan | Izin |
|---|---|---|
| `GET /admin/companies`, `POST /admin/companies`, `PATCH /admin/companies/{id}` | Kelola konfigurasi company/auth provider | `SA01` view/create/update; penonaktifan/penghapusan destruktif memerlukan delete `SA01` dan pemeriksaan dampak |
| `GET/POST/PATCH /admin/areas`, `/admin/stores` | Kelola hierarki regional dan store | `SA01`; validasi cakupan gabungan company-area-store dan status |
| `GET/POST/PATCH /admin/users`, `/admin/users/{id}/access` | Kelola pengguna, grant, role, dan konteks bawaan | `SA02`; cegah eskalasi di luar cakupan company operator |
| `GET/POST/PATCH /admin/roles`, `/admin/menus`, `/admin/company-menus` | Kelola privilege role dan modul | `SA03`; step-up admin berhak istimewa, audit nilai sebelum/sesudah |
| `GET/POST/PATCH /admin/connectors` | Kelola metadata konektor HRIS/LDAP/OIDC | `SA04`; secret disimpan di secret manager/field terenkripsi, disamarkan saat dibaca, host ber-allowlist, perubahan diaudit |

Nama rute ini adalah namespace usulan sesuai kebutuhan dan perlu tinjauan OpenAPI. Jangan tampilkan nilai secret provider pada respons GET atau log.

## 4. Katalog kode error awal

| HTTP | Kode | Kondisi |
|---:|---|---|
| 401 | `INVALID_CREDENTIALS` | Verifikasi kredensial lokal/HRIS gagal |
| 401 | `SESSION_EXPIRED` | Sesi atau kredensial refresh kedaluwarsa/dicabut |
| 401 | `MFA_CHALLENGE_INVALID` | Challenge MFA hilang/kedaluwarsa/salah cakupan |
| 403 | `MFA_REQUIRED_FOR_PAM` | Pengguna belum mengaktifkan MFA |
| 403 | `MFA_STEP_UP_REQUIRED` | PAM memerlukan OTP step-up terbaru |
| 403 | `PERMISSION_DENIED` | Aksi modul yang diwajibkan tidak diberikan |
| 404 | `RESOURCE_NOT_FOUND` | Objek tidak ada atau sengaja disembunyikan karena di luar cakupan |
| 409 | `TOTP_REPLAY` | Langkah OTP sudah digunakan |
| 409 | `IDEMPOTENCY_CONFLICT` | Key yang sama digunakan ulang untuk request/efek berbeda |
| 413 | `PAYLOAD_TOO_LARGE` | Body, XML, upload, telemetri, atau ekspor melampaui batas |
| 415 | `UNSUPPORTED_FILE_TYPE` | Konten upload tidak diizinkan |
| 422 | `VALIDATION_ERROR` | Nilai request gagal memenuhi kontrak domain |
| 429 | `RATE_LIMITED` | Pembatasan login/MFA/enrollment/API terlampaui |
| 502 | `HRIS_UPSTREAM_INVALID_RESPONSE` | HRIS gagal/respons tidak valid dan fallback lokal yang sah tidak tersedia |
| 503 | `DEPENDENCY_UNAVAILABLE` | Dependensi wajib tidak sehat dan operasi tidak dapat dilanjutkan dengan aman |

## 5. Matriks privilege modul

Format kode modul adalah dua huruf grup kapital diikuti dua digit modul (`CT01`), terkait dengan grup dua huruf (`CT`). Notasi `XX00` menandai pola grup/kategori, bukan modul aktual dalam daftar awal. `can_view` berarti baca/masuk; create/update/delete memetakan mutasi domain dan tidak saling menyiratkan. Semua privilege juga dibatasi RLS company/area dan pemeriksaan domain.

| Grup | Modul | Label | View | Create | Update | Delete | Catatan/kendala domain |
|---|---|---|---|---|---|---|---|
| CT | CT01 | Control Tower Eksekutif | Ya | Tidak | Tidak | Tidak | Dashboard hanya baca; agregasi hanya dalam tenant/area aktif; metrik sensitif mungkin perlu redaksi field |
| OP | OP01 | PAM Bastion | Ya | Ya | Ya | Tidak | Create = otorisasi; update = tutup/kelola state yang diizinkan. MFA wajib dan step-up terbaru jika >15 menit. Sesi/audit tidak dihapus secara fisik melalui UI/API. |
| OP | OP02 | Agent & Scheduler | Ya | Ya | Ya | Tidak | Create enrollment node/job hanya dengan role/persetujuan terpisah; update = pemeliharaan/konfigurasi; catatan node/job disimpan dan diaudit, bukan dihapus pengguna biasa. |
| KB | KB01 | SOP & Dokumen Teknis | Ya | Ya | Ya | Ya | Penghapusan sebaiknya berupa soft-delete/arsip dengan pengamanan persetujuan/retensi; penghapusan objek file adalah lifecycle berizin terpisah. |
| RP | RP01 | Ekspor Excel Basis Data | Ya | Ya | Tidak | Tidak | Create = permintaan ekspor; perlu allowlist tabel/kolom aman, baris dalam cakupan, batas ukuran, dan audit. |
| RP | RP02 | Pembuat Laporan PDF | Ya | Ya | Tidak | Tidak | Create = job pembuatan; pengubahan template diatur terpisah; output kedaluwarsa sesuai kebijakan retensi. |
| SA | SA01 | Company & Area | Ya | Ya | Ya | Ya | Penghapusan sebaiknya berupa penonaktifan; lindungi integritas hierarki dan jangan hapus admin/akses aktif terakhir. |
| SA | SA02 | Pengguna & Akses | Ya | Ya | Ya | Ya | Batasi admin grant ke company sendiri; cegah eskalasi diri; penghapusan user/akses mencabut sesi; reset MFA adalah tindakan audit terpisah. |
| SA | SA03 | Privilege Menu | Ya | Ya | Ya | Ya | Perubahan memerlukan step-up berhak istimewa dan audit sebelum/sesudah; tidak boleh memberi izin di luar wewenang aktor. |
| SA | SA04 | Konektor Eksternal | Ya | Ya | Ya | Ya | Secret hanya tulis/disamarkan saat dibaca; endpoint uji konektor menegakkan allowlist SSRF dan menyamarkan secret; penghapusan mencabut kredensial serta state circuit. |

### Aturan izin efektif

Berikan aksi `a` pada modul `m` hanya jika `active_session ∧ active_access_grant ∧ company_match ∧ area_scope_match ∧ module[m].can_a ∧ domain_rule ∧ database_RLS`. Flag yang tidak ada dianggap false. `can_delete` tidak boleh menyiratkan `can_view` di API (meski UI umumnya memerlukan view untuk memilih catatan); kebutuhan baca per operasi harus menjadi pemeriksaan eksplisit use case. Jika super-admin bypass diperlukan, definisikan sebagai role sistem terpisah dan diaudit; jangan menonaktifkan isolasi tenant secara diam-diam.

Respons menu/navigasi hanya mengembalikan modul dengan `can_view=true`. Setiap rute API tetap memeriksa flag aksi dan cakupan resource secara mandiri. Pemanggilan API buatan untuk modul tersembunyi harus gagal otorisasi.

## 6. Implikasi kontrak basis data

- Hierarki inti: `osc_company` 1→N `osc_area` 1→N `osc_store`, dengan company ID pada area/store dan constraint gabungan yang mencegah leluhur tidak cocok.
- Akses: `osc_user_access` mengikat pengguna, company, area nullable, role, konteks bawaan, dan status aktif. Tepat satu konteks bawaan/terpilih harus valid sesuai kebijakan user; tentukan perilaku untuk nol atau lebih dari satu nilai bawaan.
- Izin modul: konfigurasi company-menu mengaktifkan modul untuk tenant; assignment izin role/menu menentukan aksi pengguna. Tetapkan tabel join dan constraint unik pada fase skema; jangan hanya menyimpan izin sebagai JSON frontend.
- RLS: tabel transaksi harus memiliki policy tenant/area untuk SELECT/INSERT/UPDATE/DELETE. Pastikan baris foreign key terkait seperti objek/laporan/PAM tidak menunjuk data tenant lain. Validasi status aktif hierarki pada policy atau helper basis data tepercaya.
- Audit: activity log append-only berisi aktor, company, area, kejadian, tipe/ID target, hasil, timestamp, request ID, dan metadata yang disamarkan. Batasi grant UPDATE/DELETE role aplikasi serta tetapkan kebijakan retensi/arsip.
- Field HRIS/cache: hanya simpan hash password; pisahkan seed MFA terenkripsi dari hash backup code Argon2id; lacak waktu sinkronisasi/verifikasi; jangan simpan password HRIS asli atau URL auth lengkap yang berisi secret hasil interpolasi.

## 7. Rencana penerimaan dan verifikasi

| ID | Kriteria penerimaan | Bukti yang dihasilkan |
|---|---|---|
| API-01 | Setiap endpoint memiliki skema request/respons, syarat auth, izin, kode error, dan perilaku audit | Tinjauan OpenAPI |
| SEC-01 | Percobaan IDOR lintas company dan area tidak dapat membaca/mengubah data, termasuk ekspor dan objek lampiran | Uji integrasi negatif untuk tiap keluarga rute dan RLS |
| SEC-02 | SSRF URL HRIS, redirect, XML/XXE tidak valid, XML terlalu besar, dan kebocoran secret dalam log ditolak | Uji guard dengan upstream mock terkontrol dan pemeriksaan log |
| SEC-03 | Replay/brute force MFA, replay backup code, pencabutan sesi, serta pemeriksaan PAM tanpa MFA/kesegaran ditegakkan | Alur uji MFA/PAM dan laporan guard |
| SEC-04 | Agent menolak HMAC salah, replay, job kedaluwarsa/audience salah, dan perintah di luar allowlist | Uji protokol lintas platform |
| DATA-01 | RLS menolak secara aman konteks tenant yang hilang/tidak valid/nonaktif dan menghormati grant seluruh company vs area tertentu | Uji matriks policy basis data |
| FILE-01 | Objek RustFS privat tidak dapat diambil lintas tenant atau setelah presigned URL kedaluwarsa | Uji integrasi storage |
| OPS-01 | Perilaku saat PostgreSQL, Valkey, RustFS, dan HRIS gagal jelas dan dapat diamati | Runbook fault injection dan contoh log/metrik |
| QA-01 | Tidak ada pengujian yang diklaim lulus tanpa perintah, lingkungan, dan hasil tercatat | Laporan QA dengan status dijalankan/belum dijalankan |

Status verifikasi saat dokumen dibuat: **belum dijalankan**; kontrak masih berupa rancangan.

## 8. Prompt mikro implementasi

Gunakan satu prompt untuk tiap tahap; sertakan berkas hasil, batas pekerjaan, kriteria penerimaan, dan konteks serah terima. Jangan meminta agent mengimplementasikan semua modul sekaligus.

1. **Data/RLS — ai-base:** masukan dokumen ini; hasil ERD, urutan migrasi, constraint, dan matriks policy untuk hierarki/akses/transaksi; jangan implementasikan endpoint; penerimaan: semua tabel transaksi tercakup dan akses lintas tenant/area ditolak secara aman.
2. **Auth/identity — ai-rest:** masukan API dan model ancaman; hasil OpenAPI auth/MFA/switch context, state machine, port adapter HRIS, dan pemetaan error; penerimaan: anti-SSRF, XXE nonaktif, batas timeout/ukuran, tanpa secret teks biasa, perilaku replay/pembatasan laju eksplisit.
3. **Otorisasi modul — ai-rest + ai-base:** definisikan skema dan evaluator policy terpusat; penerimaan: izin yang hilang menolak, DB RLS menjadi lapisan pertahanan kedua, eskalasi admin diaudit.
4. **Protokol agent — ai-auto:** definisikan enrollment, job bertanda HMAC, sequence/idempotensi/lease, lifecycle layanan Windows/Linux; penerimaan: tidak ada perintah arbitrer dan kasus tanda tangan/replay negatif ditangani.
5. **SOP/laporan — ai-rest + ai-base:** definisikan lifecycle objek, allowlist ekspor, query laporan aman tenant; penerimaan: pemeriksaan tenant, batas, audit, dan semantik pemulihan jelas.
6. **BFF/navigasi — ai-site:** implementasikan cookie/session sesuai kontrak dan UI seluler setelah endpoint stabil; penerimaan: token tidak terbaca browser, proteksi rute di server, antarmuka responsif dan aksesibel.
7. **QA/SecOps — ai-docs:** petakan tiap ID penerimaan ke pengujian pytest/httpx alur/guard, mock dependensi, dan bukti; tandai belum dijalankan sampai benar-benar dieksekusi.
