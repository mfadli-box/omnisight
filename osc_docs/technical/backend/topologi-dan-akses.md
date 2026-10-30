# Topologi dan Level Akses

## 1. Zona kepercayaan

```mermaid
flowchart TB
    subgraph PUB["Zona publik"]
        U["Pengguna / browser"]
        C["Kontak klien"]
    end

    subgraph EDGE["Zona edge / DMZ"]
        WAF["WAF + rate limit"]
        NGX["Reverse proxy Nginx/Traefik"]
    end

    subgraph APP["Zona aplikasi"]
        SITE["osc_site (Next.js)"]
        REST["osc_rest (Rust API)"]
        AUTO["osc_auto (Go workers)"]
        OTEL["OTel Collector"]
    end

    subgraph DATA["Zona data"]
        PGB["PgBouncer"]
        PG[("PostgreSQL Primary")]
        PGR[("Read Replica")]
        OBJ[("Object Storage")]
        VAULT["Vault / secret manager"]
    end

    subgraph MGMT["Zona manajemen"]
        BASTION["JumpServer / bastion"]
        MON["Prometheus + Grafana + Loki"]
        WAZUH["Wazuh Manager"]
    end

    subgraph REMOTE["Jaringan klien / perangkat"]
        AGENT["OmniSight Agent"]
        ROUTER["RouterOS / perangkat"]
        DOCKER["Docker/Podman host"]
    end

    U --> WAF --> NGX
    C --> WAF
    NGX --> SITE
    NGX --> REST
    REST --> PGB --> PG
    REST --> PGR
    REST --> VAULT
    REST --> OBJ
    AUTO -->|"API internal mTLS"| REST
    AUTO --> OTEL
    REST --> OTEL
    AGENT -->|"outbound mTLS 443"| AUTO
    AGENT --> ROUTER
    AGENT --> DOCKER
    MGMT --> APP
    BASTION --> REMOTE
    WAZUH --> OTEL
```

## 2. Batas kepercayaan

| Batas | Aturan |
|---|---|
| Internet → edge | Hanya 443. WAF, rate limit, TLS 1.2+ (utamakan 1.3), HSTS, proteksi bot |
| Edge → aplikasi | Hanya route yang diizinkan, header keamanan, timeout, body limit |
| Aplikasi → database | Jaringan internal, TLS, user DB least privilege, RLS |
| Aplikasi → integrasi | Allowlist tujuan, TLS verify, SSRF protection, timeout, circuit breaker |
| Agent → collector | Outbound-only, mTLS, sertifikat per agent, tanda tangan payload |
| Manajemen → server | Hanya via bastion/VPN, MFA, sesi terekam |
| Aplikasi → Docker/Podman | Socket proxy dengan endpoint allowlist, bukan socket mentah |
| Aplikasi → RouterOS | Hanya lewat agent/tunnel manajemen, akun read-only untuk baca |

## 3. Data flow utama

### 3.1 Login pengguna

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Edge
    participant S as osc_site
    participant R as osc_rest
    participant DB as PostgreSQL
    participant MAIL as Notifier

    B->>E: POST /auth/login (HTTPS)
    E->>S: Teruskan request
    S->>R: POST /api/v1/auth/login
    R->>DB: Cari pengguna + kebijakan tenant
    R->>R: Verifikasi Argon2id / panggil HRIS
    R->>DB: Buat sesi + refresh token hash
    R->>DB: Audit login
    R-->>S: 200 envelope + Set-Cookie HttpOnly
    S-->>B: Halaman portal
    Note over R,MAIL: Jika MFA/login baru, notifikasi lewat outbox
```

Aturan cookie:

- Access token dan refresh token di cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- CSRF token dikirim ke klien dan wajib pada POST.
- Rotasi refresh token; reuse memicu pencabutan sesi.
- Logout mencabut sesi dan refresh family.

### 3.2 Login HRIS

```mermaid
sequenceDiagram
    participant R as osc_rest
    participant DB as PostgreSQL
    participant H as HRIS
    participant A as Audit

    R->>DB: Ambil koneksi + aturan HRIS aktif
    R->>R: Validasi allowlist host dan timeout
    R->>H: Request POST/GET sesuai aturan
    H-->>R: Respons JSON
    R->>R: Evaluasi success_when, field_map, role_map
    alt Sukses
        R->>DB: Upsert user, membership, role (sesuai kebijakan)
        R->>A: Audit login sukses
        R-->>R: Buat sesi
    else Gagal
        R->>DB: Catat login attempt + hris log
        R->>A: Audit login gagal
        R-->>R: Kode gagal generik
    end
```

Proteksi:

- `base_url` HRIS harus HTTPS dan masuk allowlist.
- Resolusi DNS dicek ulang untuk mencegah SSRF ke IP internal.
- Redirect ke host lain ditolak.
- Respons dibatasi ukuran dan waktu.
- Password tidak pernah disimpan atau dicatat.
- Pesan ke pengguna tidak membedakan "akun tidak ada" dan "password salah".

### 3.3 Metrik agent

Agent di jaringan klien membuka koneksi keluar ke collector. Tidak ada port masuk ke agent.

```mermaid
sequenceDiagram
    participant AG as Agent
    participant CO as Collector osc_auto
    participant R as osc_rest
    participant PG as PostgreSQL

    AG->>CO: mTLS + batch metrik + signature
    CO->>CO: Validasi sertifikat, ukuran, timestamp
    CO->>R: POST /internal/v1/ingest/metrics (service token)
    R->>R: Cek agent, tenant, rate limit
    R->>PG: Insert metric_samples
    R-->>CO: 200 envelope
```

### 3.4 Deploy container

```mermaid
sequenceDiagram
    participant U as Operator
    participant R as osc_rest
    participant DB as PostgreSQL
    participant A as Approver
    participant W as Worker/Agent
    participant D as Docker/Podman

    U->>R: Plan deploy (stack + revision)
    R->>DB: Validasi compose, image digest, policy
    R->>DB: Simpan action pending_approval
    A->>R: Approve
    R->>DB: Catat approval + audit
    R->>W: Kirim tugas eksekusi via API internal
    W->>D: Deploy
    W->>R: Laporkan status
    R->>DB: Simpan hasil, log ref
    alt Health check gagal
        R->>W: Rollback ke revision sebelumnya
    end
```

### 3.5 Perubahan firewall MikroTik

```mermaid
sequenceDiagram
    participant U as Operator
    participant R as osc_rest
    participant A as Approver
    participant AG as Agent jaringan
    participant M as RouterOS
    participant DB as PostgreSQL

    U->>R: Rencana perubahan terstruktur
    R->>DB: Validasi + simpan draft
    U->>R: Ajukan approval
    A->>R: Setujui
    R->>AG: Ambil snapshot pre_change
    AG->>M: Backup konfigurasi
    AG->>R: Snapshot tersimpan
    R->>AG: Terapkan perubahan
    AG->>M: Terapkan aturan (allowlist)
    AG->>R: Verifikasi konektivitas
    alt Koneksi manajemen hilang
        R->>AG: Jalankan rollback otomatis
    end
    R->>DB: Simpan hasil + audit
```

## 4. Level akses

### 4.1 Peran platform

Peran platform disimpan di `core.user_platform_roles`, terpisah dari membership perusahaan. Rincian izin ada di [matriks izin](../../security/matriks-izin.md).

| Peran | Bisa | Tidak bisa |
|---|---|---|
| Platform Owner | Kelola perusahaan, integrasi platform, feature flag | Melihat data bisnis tanpa impersonasi |
| Platform Support | Baca status sistem, audit platform | Mengubah data perusahaan |
| Platform Security | Audit global, review akses | Mengubah konfigurasi bisnis |
| Billing/Admin (jika ada) | Data langganan | Data operasional |

Impersonasi:

- Wajib `AM08:post`, alasan, MFA ulang, batas waktu, dan persetujuan.
- Semua aksi selama impersonasi diaudit dan memakai `request_id` sesi impersonasi.
- Banner jelas di UI bahwa sesi impersonasi aktif.

### 4.2 Peran perusahaan

| Peran | Scope | Modul | Catatan |
|---|---|---|---|
| Company Admin | Perusahaan | Semua modul | Kelola anggota dan peran |
| Area Manager | Area + turunan | Aset, jaringan, monitoring, tiket, container | Approval di area |
| NOC Operator | Area | Monitoring, jaringan, container | Aksi destruktif perlu approval |
| Field Technician | Area | Aset, tiket | Check-out/in aset |
| Viewer | Perusahaan/area | Read | Tidak boleh melihat audit sensitif |
| Auditor | Perusahaan | Read audit, review akses | Tidak boleh mengubah data |
| Requester | Diri sendiri | Tiket, permintaan akses, artikel | Tidak melihat aset selain miliknya |

### 4.3 Matriks izin ringkas

| Modul | Company Admin | Area Manager | NOC | Technician | Viewer | Auditor | Requester |
|---|---|---|---|---|---|---|---|
| AA Dashboard | read | read | read | read | read | read | read (self) |
| AB Identitas | post | read | read | read | read | read | - |
| AC Aset | post | post | read | post | read | read | - |
| AD Jaringan | post | post | post* | read | read | read | - |
| AE Monitoring | post | post | post | read | read | read | - |
| AF Container | post | post* | post* | read | read | read | - |
| AG Edge | post | post* | read | - | read | read | - |
| AH Backup | post | read | read | - | read | read | - |
| AI Akses | post | post | read | - | - | read | post (self) |
| AJ Layanan | post | post | post | post | read | read | post (self) |
| AK Konten | post | read | read | read | read | read | read |
| AL Audit | read | read | read | - | - | read | - |
| AM Platform | post | - | - | - | - | read | - |

`post` mencakup `read`; `*` berarti aksi sensitif tetap memerlukan approval dan audit; `self` berarti hanya data sendiri. Tabel ini ringkas; sumber lengkap per submodul ada di [matriks izin](../../security/matriks-izin.md).

### 4.4 Evaluasi otorisasi

Setiap request:

1. Verifikasi JWT, sesi, status pengguna.
2. Tentukan perusahaan aktif dari header/route; validasi membership aktif.
3. Tentukan scope area; validasi area berada di perusahaan dan termasuk area yang diizinkan.
4. Cek izin `module_code:action`.
5. Cek kepemilikan resource dan scope data.
6. Jika aksi sensitif, cek approval dan kebijakan.
7. Tulis audit jika aksi mengubah data atau ditolak.
8. Kembalikan envelope.

Larangan:

- Jangan menentukan tenant dari `company_id` di body.
- Jangan mengandalkan filter frontend.
- Jangan membocorkan keberadaan data di luar scope; gunakan kode "tidak ditemukan".
- Jangan menyimpan daftar izin lengkap di JWT tanpa mekanisme pencabutan.

## 5. Autentikasi antar layanan

| Pemanggil | Tujuan | Metode |
|---|---|---|
| Frontend | osc_rest | Cookie sesi + CSRF, same-origin via edge |
| osc_auto | osc_rest | mTLS + service token, network policy |
| Agent | collector | mTLS + payload signature |
| osc_rest | integrasi eksternal | HTTPS + kredensial vault, allowlist |
| Worker | Docker/Podman | Socket proxy dengan endpoint allowlist |
| Admin | server | Bastion/VPN + MFA |

Service token:

- Umur pendek, scope sempit, diaudit.
- Disimpan di secret file, bukan environment yang tercetak.
- Dapat dicabut tanpa restart seluruh sistem.

## 6. Port dan firewall

| Layanan | Port | Akses |
|---|---|---|
| HTTPS publik | 443 | Internet |
| osc_rest | 8080 | Hanya edge dan osc_auto |
| osc_auto collector | 8443 | Hanya agent (mTLS) |
| OTLP | 4317 | Hanya aplikasi internal |
| Prometheus scrape | 9090 | Hanya monitoring |
| PostgreSQL | 5432 | Hanya PgBouncer/aplikasi |
| PgBouncer | 6432 | Hanya osc_rest |
| Docker/Podman API | 2375/2376 | Hanya localhost/socket proxy |
| RouterOS API | 8728/8729 | Hanya agent/tunnel manajemen |
| SSH | 22 | Hanya bastion/VPN |
| Wazuh agent | 1514/1515 | Hanya manager internal |

Aturan umum:

- Default deny pada firewall host dan jaringan.
- Tidak ada database, Docker API, RouterOS API, atau metrics yang terbuka ke internet.
- Agent tidak membuka port masuk.
- Egress dibatasi untuk integrasi yang diizinkan.

## 7. Deployment logis

```mermaid
flowchart LR
    subgraph HOST1["Host Ubuntu utama"]
        EDGE["Edge Nginx/Traefik"]
        SITE["osc_site"]
        REST1["osc_rest"]
        AUTO1["osc_auto"]
        PGB["PgBouncer"]
        PG[("PostgreSQL")]
        OBS["Observability"]
    end

    subgraph HOST2["Host cadangan / replika"]
        REST2["osc_rest"]
        AUTO2["osc_auto"]
        PGR[("Read Replica")]
    end

    EDGE --> SITE
    EDGE --> REST1
    EDGE --> REST2
    REST1 --> PGB --> PG
    REST1 --> PGR
    REST2 --> PGR
    AUTO1 --> REST1
    AUTO2 --> REST1
    OBS --- REST1
    OBS --- AUTO1
```

Prinsip deployment:

- Stateless `osc_rest` dan `osc_auto` agar mudah diskalakan.
- Database stateful dengan backup dan failover.
- Edge menjadi satu-satunya titik masuk publik.
- Observability tidak diekspos publik.
- Konfigurasi melalui file/secret, bukan image.

## 8. Penanganan penolakan dan error di edge

- WAF memblokir serangan, tetapi respons ke klien tetap halaman/kode yang aman.
- Aplikasi tidak memakai 403; penolakan diwakili kode `AA00-00-0003`.
- Error infrastruktur (502/503/504) dari edge dipetakan ke halaman pemeliharaan dengan envelope kode `AA00-00-0900` untuk klien API, agar tidak terlihat seperti "bridge rusak".
- Health check internal (`/internal/healthz`) tetap memakai status HTTP nyata dan hanya dapat diakses jaringan internal.
- Semua penolakan dan error dicatat di log/metrics; menyembunyikan status HTTP bukan berarti menyembunyikan kejadian.

## 9. Checklist akses

- [ ] Tidak ada data lintas perusahaan yang bisa diakses dengan menebak ID.
- [ ] Scope area diuji untuk area anak/cabang.
- [ ] Perubahan role langsung memengaruhi request berikutnya.
- [ ] Sesi dicabut saat pengguna dinonaktifkan.
- [ ] Admin wajib MFA.
- [ ] Service token tidak dapat dipakai dari internet.
- [ ] Agent yang dicabut tidak bisa mengirim data.
- [ ] Impersonasi memiliki alasan, batas waktu, dan audit.
- [ ] Semua endpoint punya deklarasi modul/aksi sesuai [matriks izin](../../security/matriks-izin.md).
- [ ] Audit mencatat aktor, tenant, scope, dan request id.
- [ ] Self-service tidak menerima `user_id` dari klien.
- [ ] Approval tidak dapat dilakukan sendiri.
