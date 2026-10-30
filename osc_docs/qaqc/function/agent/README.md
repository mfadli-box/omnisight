# Fungsi Agent

Status: Disetujui (0.6)

Agent berjalan di host atau jaringan klien, mengirim data keluar, dan menjalankan tugas terbatas yang sudah disetujui. Agent tidak mengakses database dan tidak menerima shell bebas.

## 1. Katalog fungsi

| Kode | Fungsi | Input | Output | Gagal |
|---|---|---|---|---|
| AG-F-01 | Enrollment | Token sekali pakai, CSR, fingerprint | Sertifikat client, CA | Token invalid/kedaluwarsa ditolak |
| AG-F-02 | Heartbeat | Versi, kapabilitas, status | Status online, metrik agent | Buffer dan backoff, alert offline |
| AG-F-03 | Metrik host | CPU, RAM, disk, network, uptime | Batch metrik bertanda tangan | Batch ditahan di buffer |
| AG-F-04 | Metrik container | Status, CPU, memori, image digest | Batch metrik container | Dilewati dengan catatan |
| AG-F-05 | Poll tugas | Agent ID, nonce, waktu | Tugas atau kosong | Long poll berulang dengan backoff |
| AG-F-06 | Eksekusi tugas | `task_id`, jenis, payload, signature, expiry | Hasil, log ringkas, status | Ditolak jika invalid/kedaluwarsa |
| AG-F-07 | Backup konfigurasi | Target perangkat, akun baca | Objek terenkripsi + checksum | Retry terbatas, alert |
| AG-F-08 | Apply edge config | Template tervalidasi, checksum | Status reload, hasil validasi | Rollback konfigurasi |
| AG-F-09 | Buffer lokal | Batch saat offline | Batch terkirim berurutan | Data tertua dihapus saat penuh |
| AG-F-10 | Update agent | Manifest bertanda tangan | Versi baru atau rollback | Update dibatalkan |
| AG-F-11 | Audit lokal | Aksi dan hasil | Log lokal + kiriman ke collector | Log lokal tetap disimpan |

## 2. Jenis tugas yang diizinkan

- `deploy_stack`
- `rollback_stack`
- `snapshot_config`
- `apply_edge_config`
- `collect_container_metrics`
- `rotate_certificate`
- `health_check`

Tugas lain ditolak. Setiap tugas memiliki `expires_at`, `max_runtime`, dan `idempotency_key`.

## 3. Input dan output

Input agent:

- Konfigurasi lokal tervalidasi.
- Sertifikat client dan CA.
- Token enrollment saat pertama kali.
- Tugas dari collector.
- Sinyal healthcheck lokal.

Output agent:

- Heartbeat dan metrik bertanda tangan.
- Hasil tugas.
- Checksum konfigurasi.
- Log audit lokal.

Agent tidak mengirim isi konfigurasi yang mengandung kredensial, environment variable, password, token, private key, atau data pribadi.

## 4. Pemetaan modul

| Modul | Fungsi agent |
|---|---|
| AE Monitoring | Heartbeat, metrik host/container |
| AF Container | Deploy, rollback, status stack |
| AD Jaringan | Poll perangkat, snapshot, diagnostik terbatas |
| AH Backup | Ambil konfigurasi perangkat |
| AG Edge | Apply config Nginx, reload, rollback |

## 5. Aturan non-fungsional

- Outbound-only dan mTLS.
- Payload ditandatangani Ed25519.
- Buffer terenkripsi dan dibatasi.
- Timeout, resource limit, dan allowlist.
- Update bertanda tangan dan dapat di-rollback.
- Log tidak memuat rahasia.

## 6. Checklist

- [ ] Semua fungsi memiliki input/output yang jelas.
- [ ] Tugas di luar allowlist ditolak.
- [ ] Setiap tugas memiliki expiry dan idempotency.
- [ ] Data sensitif tidak dikirim.
- [ ] Buffer dan backoff tersedia.
- [ ] Update dan rollback tersedia.
