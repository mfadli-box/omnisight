# Pemetaan Rekayasa Ulang Directus ke OmniSight

| Dokumen | Nilai |
|---|---|
| Status | Rancangan arsitektur awal; perlu tinjauan backend, data, SecOps, dan operasi |
| Sasaran analisis | Directus sebagai pembanding kapabilitas platform backend, bukan sumber kode yang disalin |
| Sistem tujuan | OmniSight DevSecOps untuk operasi SRE multi-company, area, dan store |
| Batas | Analisis autentikasi/SSO, koleksi/RBAC, penyimpanan berkas, webhook/alur; belum mencakup implementasi atau kesetaraan fitur penuh |

## Ringkasan

Directus menyediakan backend generik di atas skema SQL: API REST/GraphQL, Data Studio, model data berbasis koleksi, kontrol akses terperinci, manajemen berkas, dan otomasi Flows. Kapabilitas ini berguna sebagai acuan inventarisasi kebutuhan, tetapi tidak otomatis memenuhi domain operasional OmniSight.

OmniSight dirancang sebagai aplikasi khusus domain dengan Rust BaaS, PostgreSQL RLS untuk isolasi Company–Area–Store, Valkey untuk state sementara seperti circuit breaker, RustFS S3 untuk objek, Next.js sebagai BFF/UI, dan Go Agent untuk telemetri serta job terverifikasi. Kontrol akses OmniSight harus ditegakkan oleh backend dan basis data, bukan hanya oleh menu UI atau izin API.

## Perbandingan komponen

| Domain | Directus (menurut dokumentasi) | Padanan rancangan OmniSight | Perbedaan dan keputusan |
|---|---|---|---|
| Auth / SSO | Mendukung autentikasi token/sesi, integrasi SSO, dan MFA. Token terkait pengguna membawa izin pengguna. Directus mengabstraksikan login dan penerbitan token. | Rust BaaS `/baas/v1/auth/*`; Argon2id lokal dan HRIS ASMX; konfigurasi penyedia autentikasi perusahaan; TOTP, backup code, reset MFA; JWT/challenge; Next.js BFF menyimpan sesi dalam cookie HttpOnly. | Integrasi ASMX dan fallback cache HRIS adalah kebutuhan khusus. Untuk upstream, gunakan allowlist host, timeout, batas respons 64 KiB, parser XML tanpa DTD, penyamaran password, circuit breaker 5 kegagalan/30 detik yang terbuka selama 60 detik. Cache Argon2id hanya berlaku sampai TTL sinkronisasi HRIS. LDAP/M365 OIDC tercantum sebagai konfigurasi provider, tetapi kontrak dan kriteria penerimaan implementasinya perlu ditetapkan terpisah. |
| Koleksi / RBAC | Koleksi memetakan tabel SQL dan membentuk API. Kontrol akses menggabungkan pengguna, role, policy, izin per koleksi/aksi, dan pembatasan record/field. Aksi Directus mencakup create/read/update/delete/share; sebagian policy dapat bersifat aditif. | Tabel domain eksplisit (`osc_company`, `osc_area`, `osc_store`, IAM, SOP, PAM, agent, report, audit); `osc_role`, `osc_user_access`, `osc_menu`, `osc_company_menu`; flag modul `can_view/create/update/delete`; PostgreSQL RLS untuk penyaringan baris. | RLS dan validasi relasi aktif memberi lapisan pertahanan basis data selain otorisasi aplikasi. Jangan menganggap menu tersembunyi sebagai kontrol. Jangan mengadopsi semantik aditif tanpa analisis: grant izin tidak boleh meluaskan tenant/area melewati konteks terpilih. Aksi `share` Directus tidak dipetakan menjadi grant otomatis. |
| Penyimpanan berkas | Directus menyimpan metadata berkas pada koleksi sistem dan byte berkas melalui adapter storage yang dapat dikonfigurasi, termasuk S3-compatible. Asset API menerapkan akses berdasarkan izin metadata dan dapat mengubah gambar. | Rust BaaS memvalidasi akses SOP/laporan dan berinteraksi dengan RustFS melalui S3; PostgreSQL menyimpan metadata, cakupan tenant/area, object key, checksum, MIME, pengunggah, dan audit. | Pisahkan otorisasi metadata dari akses objek. Object key bukan rahasia atau otorisasi. Backend memberi stream terotorisasi atau presigned URL berumur pendek; validasi ukuran, MIME berdasarkan konten, ekstensi, nama, pemindaian malware bila tersedia, dan cakupan tenant sebelum upload/download. Transformasi gambar Directus bukan kebutuhan inti kecuali diputuskan kemudian. |
| Webhook / Flows | Flows memiliki pemicu event hook (blocking/non-blocking), webhook masuk, schedule, manual, atau flow lain; pemicu memulai operasi dan rangkaian data. | Go Agent/Scheduler menangani heartbeat, healthcheck terjadwal, dispatch job, dan upload log; backend Rust menerima kejadian terautentikasi dan menulis audit/outbox; integrasi webhook ditangani adapter terpisah bila diperlukan. | Mesin alur generik berbeda dari pelaksana job dengan hak OS. Agent hanya menerima job bertanda HMAC-SHA256, timestamp/nonce/idempotency, expiry, dan allowlist command lokal; tanpa shell/perintah arbitrer. Webhook masuk harus memakai autentikasi kuat, perlindungan replay, pembatasan laju, batas ukuran payload, dan audit. Job asinkron memakai percobaan ulang terbatas dan status dead-letter/terminal. |

Directus mendokumentasikan koleksi sebagai model data yang memetakan skema basis data, permission sampai tingkat field/item, serta Flows yang dipicu event, schedule, atau webhook. Ini menjadi bukti kapabilitas pembanding, bukan bukti bahwa setiap kebutuhan OmniSight tersedia tanpa pengembangan khusus ([ikhtisar Directus](https://directus.com/docs/), [model data](https://directus.com/docs/getting-started/data-model), [kontrol akses](https://directus.com/docs/guides/auth/access-control), [pemicu Flows](https://directus.com/docs/guides/flows/triggers)).

## Pemetaan batas Clean Architecture

| Lapisan | Isi OmniSight | Aturan dependensi |
|---|---|---|
| Domain (`osc_rest/src/domain`) | Aturan Company/Area/Store, access grant, sesi PAM, SOP, agent/job, value object audit | Tidak mengimpor HTTP, SQLx/driver, Valkey, RustFS SDK, atau framework |
| Application (`src/application`) | Use case login, switch context, PAM authorize, CRUD SOP, ekspor laporan, enrollment/heartbeat/claim job agent | Bergantung pada port domain dan abstraksi repository/provider; transaksi dan otorisasi dinyatakan eksplisit |
| Infrastructure (`src/infrastructure`) | Repository PostgreSQL/konteks RLS, klien HRIS ASMX, circuit breaker/pembatas laju Valkey, adapter S3 RustFS, email, adapter job/outbox | Rincian provider dapat diganti; validasi input dan kontrol koneksi keluar tetap di batas |
| Presentation (`src/presentation`) | Rute HTTP `/baas/v1/*`, DTO, kontrak cookie/BFF, pemetaan error, middleware | Mengubah request tak tepercaya menjadi input use case; tidak menjalankan aturan bisnis sendiri |
| Frontend BFF (`osc_site`) | Route Handler, cookie sesi, kebijakan CSRF/origin, proxy API | Token tidak masuk localStorage; otorisasi sebenarnya tetap dilakukan server/backend |
| Agent (`osc_auto`) | Layanan agent lintas Windows/Linux, telemetri, scheduler, healthcheck ber-allowlist | Tidak dipercaya hanya karena berada di jaringan internal; semua job diverifikasi dan dibatasi secara lokal |

## Model keamanan dan batas tenant

1. **Konteks per request:** middleware Rust memvalidasi identitas, company, akses area, role, dan aksi modul sebelum use case berjalan. Konteks tenant berasal dari grant akses tervalidasi, bukan header bebas dari klien.
2. **RLS menolak secara aman:** mulai transaksi, atur `app.current_company_id` dan daftar `app.allowed_area_ids` untuk transaksi itu; query transaksi berjalan di dalamnya. Jika konteks hilang, tidak valid, atau company/area tidak aktif, tolak akses. Jangan gunakan role pemilik basis data/superuser untuk aplikasi; aktifkan `FORCE ROW LEVEL SECURITY` pada tabel yang memerlukannya.
3. **Hierarki:** constraint dan policy harus memastikan `store.company_id` cocok dengan `area.company_id`, serta store/area/company aktif. Akses seluruh company (`area_id IS NULL`) hanya berarti semua area aktif dalam company terpilih; bukan lintas company.
4. **PAM:** pengguna tanpa MFA mendapat `403 MFA_REQUIRED_FOR_PAM`; OTP step-up diperlukan jika verifikasi terakhir lebih dari 15 menit. Backend memvalidasi keputusan ini kembali saat authorize, bukan mempercayai UI.
5. **Agent:** autentikasi node dan HMAC job terpisah dari sesi pengguna; diperlukan kunci per node, rotasi/pencabutan, perlindungan replay, audience/expiry, dan audit. Allowlist command dikonfigurasi lokal dan tidak dapat diperluas oleh job jarak jauh.
6. **Audit:** log aktivitas append-only untuk akun aplikasi; catat aktor, konteks tenant, tindakan, target, request ID, hasil, dan sumber. Hindari password, OTP, backup code, JWT, secret, serta parameter `uPaswd`.

Kontrol ini memetakan risiko OWASP yang relevan: kontrol akses rusak/IDOR dan kebocoran lintas tenant, kegagalan identifikasi dan autentikasi, injection, SSRF, salah konfigurasi keamanan, kegagalan kriptografi, dan kegagalan logging/pemantauan. Uraikan ancaman dan kontrol menjadi kasus uji di `osc_docs/test_guard/` sebelum gerbang produksi.

## Celah dan keputusan lanjutan

- **Cakupan SSO/provider:** tentukan urutan fase: lokal + HRIS ASMX dahulu atau termasuk LDAP/M365 OIDC. Tetapkan pemetaan lifecycle, timeout, perilaku outage, logout/pencabutan, dan klaim identitas tiap provider.
- **Cakupan policy RLS:** inventarisasi seluruh tabel transaksi dan relasi; buktikan policy mencakup SELECT/INSERT/UPDATE/DELETE, termasuk baris turunan, query laporan, dan ekspor.
- **Semantik privilege:** tetapkan apakah role memiliki satu set izin efektif atau ada deny override. Rekomendasi: tolak secara default; batasi izin efektif pada irisan grant modul, role/access grant, konteks tenant, dan RLS. Definisikan izin admin khusus secara eksplisit.
- **RustFS:** tentukan model bucket privat, versioning/lifecycle, enkripsi, backup/restore, prefix bucket/key, batas upload, retensi, dan kebijakan presigned URL.
- **Pemrosesan job:** definisikan antrean/outbox durable, idempotensi, jadwal percobaan ulang, timeout, cancellation, dead-letter, concurrency per store, dan versi skema payload bertanda tangan.
- **Kesetaraan Directus:** bukan target kesamaan UI/API. OmniSight mengimplementasikan workflow SRE/PAM/isolasi tenant khusus, sedangkan Directus menjadi referensi kategori kapabilitas.

## Rencana tinjauan bertahap

| Urutan | Pemilik | Hasil | Kriteria penerimaan |
|---|---|---|---|
| 1. Validasi domain dan model ancaman | ai-docs + ai-main | ADR cakupan provider, diagram aliran data, kasus penyalahgunaan | Semua aktor/batas kepercayaan, data sensitif, penolakan aman, dan risiko residual tercatat |
| 2. Kontrak data/RLS | ai-base | ERD, rencana migrasi, matriks policy RLS, seed katalog modul | Semua tabel/aksi dipetakan; rencana uji negatif lintas company/area tersedia |
| 3. Kontrak auth/API | ai-rest | DTO, OpenAPI, taksonomi error, lifecycle sesi | Endpoint, status, autentikasi, otorisasi, audit, pembatasan laju, dan idempotensi eksplisit |
| 4. Adapter storage dan HRIS | ai-rest | Kontrak port/provider, konfigurasi, penanganan kegagalan | SSRF/XXE/batas, batasan upload, timeout, outage/rollback ditentukan |
| 5. Protokol agent | ai-auto + ai-rest | Skema job bertanda tangan dan lifecycle | Replay, kedaluwarsa, tanda tangan gagal, allowlist, dan pengiriman duplikat ditangani |
| 6. UI/BFF dan gerbang QA | ai-site + ai-docs | Alur seluler, model cookie/CSRF, rencana uji | Tidak ada token yang terbaca browser; kasus negatif role/tenant teruji |

## Referensi Directus

- [Ikhtisar Directus](https://directus.com/docs/) — API, model data, permission, ekstensi, Flows.
- [Autentikasi pengguna](https://directus.com/docs/getting-started/authenticate-user) dan [token akses](https://directus.com/docs/guides/auth/tokens-cookies) — perilaku login/token/sesi.
- [Kontrol akses](https://directus.com/docs/guides/auth/access-control) — aturan koleksi/aksi, item/field, role/policy.
- [API berkas Directus](https://directus.com/docs/api/files) dan [panduan upload/akses](https://directus.com/docs/getting-started/upload-files) — adapter storage, metadata berkas, akses.
- [Pemicu Flows](https://directus.com/docs/guides/flows/triggers) — semantik pemicu event, webhook, schedule, dan manual.
- [Ikhtisar fitur SSO Directus](https://directus.com/features/sso) — OAuth, OpenID, LDAP; perilaku provider dan edisi/konfigurasi perlu diverifikasi terhadap rilis Directus pilihan bila diperlukan analisis kompatibilitas lebih dalam.

## Batas analisis

Dokumen Directus yang dirujuk menjelaskan kapabilitas menurut dokumentasi saat analisis. Audit kode sumber Directus, benchmark, tinjauan lisensi mendalam, dan uji kompatibilitas runtime tidak dilakukan. Versi final, lisensi deployment, dan perilaku provider harus diverifikasi terhadap tag/rilis sasaran sebelum migrasi dimulai.
