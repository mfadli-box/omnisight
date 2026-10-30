# Alur Data Backend

Status: Disetujui (0.6)

Backend `osc_rest` menerima request dari edge, memvalidasi identitas dan izin, menjalankan use case, lalu mengembalikan envelope. Backend adalah satu-satunya jalur tulis database domain.

## 1. Siklus request

```mermaid
sequenceDiagram
    participant B as Browser/Agent
    participant E as Edge
    participant API as osc_api
    participant UC as Application
    participant DB as PostgreSQL
    participant EXT as Adapter eksternal

    B->>E: Request
    E->>API: Teruskan + header keamanan
    API->>API: request_id, logging, authn
    API->>API: locale, tenant, authz, audit
    API->>UC: Panggil use case
    UC->>DB: Transaksi + RLS
    UC->>EXT: Adapter (jika perlu)
    EXT-->>UC: Data/status
    UC-->>API: Hasil/error domain
    API-->>B: Envelope HTTP 200
```

Urutan middleware: `request_id`, `logging`, `security_headers`, `body_limit`, `rate_limit`, `cors`, `csrf`, `authn`, `locale`, `tenant`, `authz`, `audit`, `error_map`.

## 2. Login HRIS

```mermaid
sequenceDiagram
    participant U as Pengguna
    participant API as osc_rest
    participant A as HrisAdapter
    participant H as HRIS
    participant DB as PostgreSQL

    U->>API: POST /auth/login/hris
    API->>A: Kirim kredensial (TLS)
    A->>H: POST/GET sesuai konfigurasi
    H-->>A: Respons + status
    A->>A: Mapping user, role, aturan gagal
    A-->>API: Identitas atau error
    API->>DB: Simpan sesi/refresh + audit
    API-->>U: Envelope + cookie HttpOnly
```

Aturan:

- Password tidak pernah disimpan atau dilog.
- Timeout, circuit breaker, dan allowlist host.
- Pesan gagal generik ke pengguna.
- Fallback lokal hanya jika kebijakan perusahaan mengizinkan.
- Role dari HRIS tidak boleh menjadi platform owner.

## 3. Approval dan aksi berisiko

```mermaid
sequenceDiagram
    participant U as Pemohon
    participant API as osc_rest
    participant DB as PostgreSQL
    participant AP as Approver
    participant A as Agent

    U->>API: Buat rencana perubahan
    API->>DB: Simpan rencana, diff, risiko
    API-->>U: Menunggu approval
    AP->>API: Setujui/tolak + alasan
    API->>DB: Simpan keputusan + audit
    API->>A: Antrekan tugas bertanda tangan
    A-->>API: Hasil eksekusi
    API->>DB: Status + audit
```

Aksi seperti firewall, deploy, restore, dan akses bastion tidak boleh dieksekusi tanpa approval. Idempotency key mencegah eksekusi ganda.

## 4. Adapter eksternal

```mermaid
flowchart LR
    UC["Use case"] --> PORT["Port trait"]
    PORT --> HRIS["HRIS"]
    PORT --> ROS["RouterOS"]
    PORT --> DOC["Docker/Podman"]
    PORT --> WAZ["Wazuh"]
    PORT --> CMDB["NetBox/Snipe-IT"]
    PORT --> ITSM["GLPI"]
```

- Semua panggilan keluar melewati allowlist dan proteksi SSRF.
- Timeout, retry backoff, dan circuit breaker.
- Kredensial hanya referensi vault.
- Error eksternal dipetakan ke kode OmniSight yang stabil.
- Token dan password tidak masuk log.

## 5. Notifikasi asinkron

```mermaid
sequenceDiagram
    participant API as osc_rest
    participant DB as PostgreSQL
    participant W as osc_auto Worker
    participant N as Notifier

    API->>DB: Tulis outbox dalam transaksi
    W->>DB: Ambil event (idempotent)
    W->>N: Kirim email/webhook
    N-->>W: Status
    W->>DB: Tandai terkirim/gagal
```

Kegagalan notifier tidak membatalkan transaksi bisnis. Outbox memastikan event tidak hilang.

## 6. Error dan lokalisasi

- Semua hasil bisnis memakai HTTP 200 dan envelope.
- Penolakan akses `AA00-00-0003`; tidak ada 403.
- Error internal `AA00-00-0100`; layanan pendukung `AA00-00-0900`.
- `Accept-Language` > locale pengguna > locale perusahaan > `en`.
- `code` stabil; `message`/`reason` terlokalisasi.
- `request_id` selalu dikembalikan.

## 7. Checklist

- [ ] Middleware berjalan sesuai urutan.
- [ ] Tenant dan scope divalidasi sebelum use case.
- [ ] Aksi berisiko memiliki approval dan idempotency.
- [ ] Adapter memiliki timeout dan circuit breaker.
- [ ] Outbox dipakai untuk event asinkron.
- [ ] Error tidak membocorkan detail internal.
- [ ] Log memuat `request_id`, tenant, dan locale.
