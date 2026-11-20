# Topologi Sistem OmniSight

## Tujuan dan asumsi

Diagram ini menunjukkan rancangan logis sasaran, bukan konfigurasi produksi yang sudah diverifikasi. Lingkungan terdiri dari browser operator, backend/API Rust, PostgreSQL, Valkey, RustFS, HRIS ASMX intranet, dan Go Agent yang dipasang di Store/VM. UI Next.js memakai BFF untuk mengelola cookie sesi. Agen Store hanya membuat koneksi keluar yang diperlukan ke backend; tidak ada akses langsung dari agen ke PostgreSQL, Valkey, atau RustFS.

## Diagram konteks dan aliran jaringan

```mermaid
flowchart LR
  subgraph StoreZone[Jaringan Store / Regional]
    StoreUser[Browser operator]
    GoAgent[Layanan Go Agent\nWindows / Ubuntu]
    Host[Host / perangkat Store]
    Host -->|pemeriksaan kesehatan lokal ber-allowlist| GoAgent
    StoreUser -->|HTTPS 443| Web[UI Next.js + BFF]
    GoAgent -->|HTTPS mTLS keluar\nheartbeat / polling job / hasil| API
  end

  subgraph AppZone[Zona aplikasi OmniSight]
    Web -->|request API sisi server| API[Rust BaaS\n/baas/v1/*]
    API -->|transaksi tenant\nkonteks RLS| PG[(PostgreSQL\nCompany-Area-Store + RLS)]
    API -->|pembatasan laju / status circuit / cache sementara| Cache[(Valkey)]
    API -->|API S3 privat\nobjek dengan metadata terotorisasi| Obj[(RustFS)]
    API -->|tambahkan audit / outbox| PG
    Scheduler[Go Scheduler / Worker] -->|job bertanda tangan + state| PG
    Scheduler -->|lease / koordinasi singkat| Cache
    Scheduler -->|dispatch lewat kanal keluar agen| API
  end

  subgraph IntranetZone[Intranet perusahaan]
    HRIS[Endpoint HRIS ASMX]
    Directory[LDAP / M365 OIDC opsional\nfase provider belum ditentukan]
  end

  API -->|HTTP(S) ber-allowlist\ntimeout + batas respons 64 KiB| HRIS
  API -.->|adapter provider mendatang| Directory

  classDef trust fill:#f7f1ff,stroke:#7652a3,color:#202020;
  class StoreZone,AppZone,IntranetZone trust;
```

### Jalur utama

1. **Web:** browser membuka Next.js melalui HTTPS. Browser mengirim cookie HttpOnly/Secure/SameSite=Strict ke BFF. BFF memeriksa kebijakan origin/CSRF dan meneruskan request terautentikasi ke Rust BaaS melalui jaringan internal. JWT tidak disimpan di localStorage.
2. **Store/Agent:** agen membuat koneksi keluar terautentikasi ke API untuk heartbeat, mengambil job yang ditugaskan, lalu mengirim status/log. Backend/scheduler memverifikasi identitas node dan tanda tangan job. Tidak ada perintah bebas; agen hanya menjalankan pemeriksaan kesehatan lokal dari allowlist.
3. **Backend/basis data:** backend memvalidasi token, privilege modul, company dan area aktif; membuat konteks RLS lokal transaksi; menjalankan repository/use case dalam transaksi PostgreSQL; mencatat audit dalam batas transaksi yang sesuai.
4. **Cache:** Valkey menyimpan data sementara seperti counter pembatas laju, circuit breaker HRIS, lock/lease, atau koordinasi job. Data otoritatif seperti membership, audit, konfigurasi tenant, dan lifecycle sesi tetap disimpan di PostgreSQL.
5. **Object storage:** Rust BaaS menjadi titik penegakan kebijakan untuk RustFS. Metadata dan cakupan kepemilikan/tenant disimpan di PostgreSQL. Bucket bersifat privat; object key bukan izin akses. Akses langsung hanya boleh melalui presigned URL berumur pendek yang diterbitkan setelah otorisasi.
6. **HRIS:** hanya backend yang mengakses endpoint intranet dalam allowlist. Kredensial tidak diteruskan ke browser/agen dan harus disamarkan dari log. Parser XML tanpa DTD; timeout dan batas respons 64 KiB. Circuit breaker berada di Valkey; fallback kata sandi offline hanya berlaku sampai `hris_cache_ttl_hours`.

## Batas kepercayaan dan aturan akses jaringan

| Batas | Arah dan protokol rancangan | Akses yang diizinkan | Larangan/kontrol |
|---|---|---|---|
| Browser ↔ Web/BFF | HTTPS 443 | Login, UI, request BFF | Cookie HttpOnly/Secure/SameSite=Strict; perlindungan CSRF/origin; jangan kirim secret layanan ke browser |
| Agent ↔ Rust API | HTTPS/mTLS keluar 443 | Heartbeat, klaim/hasil job, telemetri | Identitas per node, pencabutan/rotasi, nonce/expiry, pembatasan laju, batas payload, tanpa kredensial DB/cache/storage |
| Next.js BFF ↔ Rust API | Jaringan layanan privat, HTTPS jika melintasi host/VM | Kontrak API `/baas/v1/*` | Identitas layanan terpisah dari token pengguna; teruskan hanya header yang diizinkan |
| Rust API ↔ PostgreSQL | TCP 5432 di subnet privat | Role DB aplikasi dan transaksi terbatas | DB tidak publik; hak minimum; TLS antar-VM; RLS menolak secara aman; larang role bypassrls/superuser |
| Rust API ↔ Valkey | TCP 6379 privat + ACL/TLS antar-VM | Cache/pembatas laju/circuit breaker | Jangan buka ke publik; ACL per layanan; jangan simpan data otoritatif tanpa jaminan durabilitas |
| Rust API ↔ RustFS | API S3 TCP 9000 privat + TLS antar-VM | Bucket khusus/privat sesuai fungsi | Secret S3 hanya sisi server; kebijakan bucket dengan hak minimum; jangan buka port konsol ke jaringan umum |
| Rust API ↔ HRIS | HTTP(S) intranet sesuai endpoint yang disetujui | Allowlist host/path/port per perusahaan | Anti-SSRF, redirect dibatasi/dinonaktifkan, validasi DNS/IP sesuai jaringan, timeout, batas 64 KiB, penyamaran parameter |
| Operator/admin ↔ observability | HTTPS/SSH melalui kontrol operasi | Metrik/log/konsol sesuai role | ACL jaringan, MFA, audit akses, jangan catat password/token/OTP |

Jika sistem dibagi ke beberapa VM, setiap koneksi antar-VM memakai subnet privat, firewall dengan allowlist sumber/port, TLS/mTLS sesuai kemampuan layanan, pemantauan kesehatan/kesiapan, serta rotasi secret. Diagram deployment final harus menetapkan terminasi TLS, DNS, ingress, jaringan backup, dan jalur admin sebelum produksi.

## Konteks tenant untuk query data

```mermaid
sequenceDiagram
  participant U as Pengguna / Agent
  participant B as Rust BaaS
  participant A as Resolver Akses
  participant D as PostgreSQL
  U->>B: Request HTTPS + sesi / identitas node
  B->>A: Resolusi grant aktif dan aksi yang diminta
  A->>D: Muat user_access, role, privilege modul, company/area aktif
  D-->>A: Cakupan tenant dan area tervalidasi
  A-->>B: Principal + company_id + allowed_area_ids + permissions
  B->>D: BEGIN; SET LOCAL app.current_company_id / app.allowed_area_ids
  B->>D: Query domain di bawah RLS
  D-->>B: Baris hanya dalam cakupan tenant/area aktif
  B->>D: Tambahkan catatan aktivitas immutable; COMMIT
  B-->>U: Respons dengan request_id
```

Konteks RLS wajib berlaku hanya dalam transaksi agar koneksi pool tidak membawa konteks tenant ke request berikutnya. Policy juga memeriksa status aktif company/area dan relasi baris turunan. Query background/sistem harus memakai principal sistem dengan grant eksplisit dan audit, bukan melewati RLS secara diam-diam.

## Kegagalan dan pemulihan

- **HRIS tidak tersedia:** buka circuit setelah 5 kegagalan/timeout dalam periode 30 detik selama 60 detik. Saat gangguan, verifikasi Argon2id lokal hanya jika `last_hris_sync_at` masih berada dalam TTL perusahaan; tulis audit `LOGIN_HRIS_OFFLINE_CACHE`. Jika cache tidak berlaku, kembalikan `502 HRIS_UPSTREAM_INVALID_RESPONSE`.
- **Valkey tidak tersedia:** tolak secara aman operasi yang bergantung pada anti-replay/pembatasan laju/keselamatan PAM jika kontrol itu tidak dapat dijamin; jangan menganggap status circuit tersimpan. Kebijakan mode terbatas setiap fitur harus ditentukan dan diuji.
- **RustFS tidak tersedia:** gagalkan upload/download tanpa membocorkan object key atau metadata lintas tenant. Catat error yang disamarkan dan ulangi hanya operasi idempoten.
- **Agent terputus:** lease heartbeat/job kedaluwarsa, tandai node stale, jangan ulangi tindakan non-idempoten tanpa idempotency key dan status job tersimpan.
- **PostgreSQL tidak tersedia:** API bisnis gagal pada health/readiness; jangan menerima perubahan yang tak dapat diaudit atau mempertahankan konteks otorisasi secara lokal.

## Observabilitas minimum

Gunakan request/correlation ID konsisten melintasi BFF, Rust API, log basis data, scheduler, dan agent. Catat latency/counter error per dependensi, status circuit HRIS dan jumlah fallback cache, umur heartbeat agent, antrean job/lease kedaluwarsa, error storage, serta hasil login/MFA yang tidak sensitif. Jangan masukkan password, OTP, backup code, bearer token, URL presigned object, atau `uPaswd` ke log.

## Keputusan terbuka

- Apakah ingress browser dan jalur API publik berada di gateway terpisah?
- Apakah mTLS agen memakai CA internal, bootstrap token sekali pakai, atau kombinasi keduanya?
- Port/protokol HRIS aktual, dukungan TLS, perilaku redirect, dan allowlist DNS/IP tiap perusahaan.
- Apakah Valkey HA/replikasi diperlukan dan bagaimana ketersediaannya memengaruhi login, pembatasan, serta lease job?
- Strategi backup/restore PostgreSQL dan RustFS, RPO/RTO, retensi, versioning objek, dan pemulihan bencana antar-VM.
- Apakah Go Scheduler berjalan sebagai layanan di VM khusus atau replika stateless di deployment container?

## Referensi

- [Ikhtisar Directus dan konsep platform](https://directus.com/docs/)
- [Stack dan kebutuhan keamanan OmniSight](../../runner.txt)
- [Kerangka Compose](../../docker-compose.yml)
