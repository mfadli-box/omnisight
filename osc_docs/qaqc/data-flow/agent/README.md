# Alur Data Agent

Status: Disetujui (0.6)

Agent mengirim data keluar melalui mTLS, menerima tugas yang sudah disetujui, dan menyimpan sementara data saat offline. Agent tidak membuka port masuk dan tidak mengakses database.

## 1. Enrollment

```mermaid
sequenceDiagram
    participant ADM as Admin
    participant R as osc_rest
    participant C as Collector
    participant A as Agent

    ADM->>R: Buat enrollment token
    R-->>ADM: Token sekali pakai
    ADM->>A: Jalankan agent dengan token
    A->>C: POST /agent/enroll (token + CSR)
    C->>R: Validasi token dan tenant
    R-->>C: Setujui
    C-->>A: Sertifikat client + CA
    A->>C: Heartbeat mTLS
    C->>R: Catat agent aktif
```

Data yang melewati jalur ini: token enrollment, CSR, fingerprint, dan identitas agent. Token tidak disimpan setelah enrollment.

## 2. Telemetri

```mermaid
sequenceDiagram
    participant A as Agent
    participant C as Collector
    participant R as osc_rest
    participant DB as PostgreSQL

    A->>A: Kumpulkan metrik host/container
    A->>A: Buat payload kanonik + signature
    A->>C: Batch mTLS
    C->>C: Validasi signature, nonce, waktu
    C->>R: API internal
    R->>DB: Simpan metrik dengan tenant/agent
    DB-->>R: OK
    R-->>C: Envelope
    C-->>A: ACK
```

Aturan:

- Batch memiliki `agent_id`, `message_id`, `sent_at`, `nonce`, dan signature Ed25519.
- Collector menolak timestamp di luar ±5 menit dan nonce berulang.
- Metrik tidak memuat environment variable, nama file sensitif, atau data pribadi.
- ACK diberikan setelah data diterima dan divalidasi, bukan setelah komit database akhir.

## 3. Tugas

```mermaid
sequenceDiagram
    participant U as Pengguna
    participant R as osc_rest
    participant C as Collector
    participant A as Agent
    participant DB as PostgreSQL

    U->>R: Ajukan aksi (deploy/firewall/restore)
    R->>DB: Simpan rencana + approval
    R-->>U: Menunggu approval
    U->>R: Setujui
    R->>C: Antrean tugas bertanda tangan
    A->>C: Poll tugas (long poll)
    C-->>A: Tugas + expiry
    A->>A: Validasi signature, expiry, allowlist
    A->>A: Eksekusi dengan timeout
    A->>C: Hasil tugas
    C->>R: Hasil + log ringkas
    R->>DB: Audit dan status
```

Agent menolak tugas yang kedaluwarsa, di luar allowlist, atau signature-nya tidak valid. Hasil tugas tidak boleh memuat rahasia.

## 4. Backup konfigurasi

```mermaid
sequenceDiagram
    participant A as Agent Backup
    participant D as Perangkat
    participant S as Object Storage
    participant R as osc_rest
    participant DB as PostgreSQL

    A->>D: Baca konfigurasi (akun read-only)
    A->>A: Enkripsi + checksum
    A->>S: Simpan objek terenkripsi
    A->>R: Kirim metadata + checksum
    R->>DB: Simpan referensi snapshot
    R-->>A: ACK
```

Isi konfigurasi tidak dikirim ke metrik atau log. Metadata yang disimpan hanya referensi objek, checksum, waktu, target, dan status.

## 5. Buffer offline

- Data disimpan terenkripsi dengan batas ukuran dan retensi.
- Heartbeat memiliki prioritas tertinggi.
- Saat buffer penuh, data tertua dihapus dengan catatan.
- Setelah reconnect, batch dikirim berurutan.
- Backoff eksponensial dengan jitter; tidak ada retry tanpa batas.

## 6. Data yang dilarang

- Password, token, private key, dan secret.
- Environment variable container.
- Isi command line proses sensitif.
- Data pribadi pengguna.
- Isi log aplikasi klien.
- Konfigurasi perangkat dalam bentuk teks mentah di metrik.

## 7. Checklist

- [ ] Enrollment memakai token sekali pakai.
- [ ] Semua payload ditandatangani dan memiliki nonce.
- [ ] Timestamp dan nonce divalidasi.
- [ ] Data sensitif tidak dikirim.
- [ ] Buffer terenkripsi dan dibatasi.
- [ ] Tugas divalidasi sebelum eksekusi.
- [ ] Backup memakai objek terenkripsi.
