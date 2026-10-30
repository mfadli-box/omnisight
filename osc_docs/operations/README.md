# Operasi dan Deployment

## 1. Lingkungan

| Lingkungan | Tujuan | Data |
|---|---|---|
| Development | Fitur harian | Data sintetis |
| Staging | UAT, migrasi, pentest | Salinan tersamarkan |
| Production | Layanan nyata | Data klien |

Aturan:

- Staging menyerupai produksi untuk topologi dan konfigurasi.
- Jangan memakai data produksi mentah di development.
- Rahasia berbeda per lingkungan.
- Feature flag memisahkan fitur yang belum siap.
- Locale default `en`; yang didukung `en` dan `id`.

Konfigurasi bahasa:

| Komponen | Variabel | Nilai |
|---|---|---|
| `osc_rest` | `OSC_DEFAULT_LOCALE` | `en` |
| `osc_rest` | `OSC_SUPPORTED_LOCALES` | `en,id` |
| `osc_site` | `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` |
| `osc_site` | `NEXT_PUBLIC_SUPPORTED_LOCALES` | `en,id` |

Aturan:

- Katalog terjemahan dibundel di image; perubahan katalog memerlukan build dan rollout image terkait.
- Deploy kunci baru harus menyertakan `en` dan `id`; kunci yang belum diterjemahkan jatuh ke `en`, bukan error.
- Bahasa per pengguna disimpan di database dan tidak perlu restart layanan.
- Jangan menaruh katalog terjemahan di volume yang dapat diubah runtime tanpa audit.

## 2. Artefak deployment yang direncanakan

```text
deploy/
├── compose/
│   ├── core.compose.yaml
│   ├── observability.compose.yaml
│   ├── agents/              # compose satuan (lihat docs agent)
│   └── .env.example
├── secrets/                 # tidak di-commit
├── backup/
│   └── pgbackrest.conf.example
└── systemd/
    └── podman-quadlet/
```

Core stack minimal:

- edge (Nginx/Traefik + WAF)
- `osc_site`
- `osc_rest`
- `osc_auto` collector, scheduler, notifier, worker
- PgBouncer
- PostgreSQL primary
- migration job sekali jalan

Observability stack:

- OpenTelemetry Collector
- Prometheus
- Grafana
- Loki + log collector
- Alertmanager

## 3. Jaringan compose

```text
edge-net   : hanya edge dan site/rest
app-net    : site, rest, auto; internal
data-net   : rest, pgbouncer, postgres; internal
obs-net    : aplikasi, otel, prometheus, loki; internal
```

Aturan:

- Hanya edge mempublikasikan 443.
- Database dan metrics tidak dipublikasikan.
- Agent berada di luar stack dan outbound.
- Gunakan network policy/firewall host sebagai lapisan kedua.

## 4. Prasyarat host Ubuntu

- Ubuntu Server LTS.
- Docker Engine + Compose plugin atau Podman + Podman Compose.
- cgroup v2.
- Disk terpisah untuk database dan backup.
- Waktu tersinkron.
- Firewall default deny.
- SSH hanya via bastion.
- Akun deploy khusus.
- Secret manager atau secret file.

## 5. Bootstrap

1. Siapkan DNS internal dan sertifikat TLS edge.
2. Siapkan direktori:
   - `/opt/omnisight/deploy`
   - `/opt/omnisight/secrets`
   - `/var/lib/omnisight/postgres`
   - `/var/lib/omnisight/backup`
3. Buat secret:
   - database password
   - JWT private/public key
   - encryption key audit/backup
   - vault token
   - SMTP/webhook credentials
4. Salin file compose dan `.env.example`.
5. Isi nilai non-rahasia.
6. Validasi:
   ```bash
   docker compose -f core.compose.yaml --env-file .env config
   podman compose -f core.compose.yaml --env-file .env config
   ```
7. Jalankan database dan PgBouncer.
8. Jalankan migration job.
9. Jalankan `osc_rest`, `osc_auto`, `osc_site`, edge.
10. Jalankan observability.
11. Buat perusahaan dan admin pertama melalui prosedur bootstrap aman (tanpa password default).
12. Daftarkan agent.
13. Uji login, isolasi tenant, alert, backup.

## 6. Secret

- Database password, JWT key, dan kunci enkripsi tidak boleh di `.env` yang di-commit.
- Gunakan Docker/Podman secret atau file dengan permission ketat.
- Jangan mencetak secret ke log.
- Rotasi:
  - JWT key: tambah `kid` baru, publikasikan JWKS, rotasi bertahap.
  - Database: buat user/password baru, update secret, restart, hapus lama.
  - Agent cert: rotasi otomatis.
  - Integrasi: rotasi di vault, uji, cabut lama.
- Simpan salinan pemulihan kunci di tempat aman terpisah.

## 7. Migrasi database

Urutan deploy:

1. Backup database.
2. Jalankan `osc-migrate` (Prisma migrate deploy).
3. Jika migrasi gagal, hentikan deploy.
4. Deploy `osc_rest` versi baru.
5. Deploy `osc_auto` dan `osc_site`.
6. Smoke test.
7. Pantau error dan latency.

Aturan:

- Migrasi backward-compatible (expand-contract).
- Tidak ada DDL dari aplikasi.
- Migrasi berat dipisah dari deploy.
- Rollback aplikasi ke versi sebelumnya; database tidak di-rollback sembarangan.
- Jika perlu rollback database, restore dari backup dengan prosedur terkontrol.

Untuk impor data awal perusahaan dari HRIS, Snipe-IT, NetBox, GLPI, atau CSV, ikuti [impor-data.md](impor-data.md).

## 8. Start, stop, dan health

```bash
# Validasi
docker compose -f core.compose.yaml --env-file .env config

# Jalankan
docker compose -f core.compose.yaml --env-file .env up -d

# Status
docker compose -f core.compose.yaml ps
docker compose -f core.compose.yaml logs --tail=200 osc-rest
```

Health:

- `/internal/healthz` untuk orchestrator, hanya jaringan internal.
- `/internal/metrics` untuk Prometheus, hanya internal.
- Healthcheck container memakai endpoint internal.
- Jangan memakai halaman publik untuk health.

## 9. Update dan rollback

Update:

1. Baca changelog dan risiko.
2. Backup.
3. Uji di staging.
4. Update image digest.
5. Migrasi.
6. Rolling restart `osc_rest` satu per satu.
7. Update `osc_auto`.
8. Update `osc_site`.
9. Smoke test dan pantau.

Rollback aplikasi:

- Kembalikan image ke digest sebelumnya.
- Pastikan migrasi masih kompatibel.
- Jika tidak, gunakan prosedur restore terkontrol.

## 10. Backup

### Database

- pgBackRest full mingguan, incremental harian, WAL archiving.
- Simpan di object storage terenkripsi, terpisah dari host.
- Uji restore minimal per kuartal.
- Pantau kegagalan backup.

### Konfigurasi dan objek

- Snapshot konfigurasi perangkat lewat fitur AH.
- File dan lampiran di object storage dengan versioning.
- Backup secret/kunci secara terpisah dan aman.

### Prinsip 3-2-1

- 3 salinan.
- 2 media/teknologi berbeda.
- 1 salinan di lokasi terpisah.

## 11. Restore

Restore database adalah aksi berisiko:

1. Ajukan permintaan dan alasan.
2. Dapatkan approval.
3. Ambil snapshot/salinan sebelum restore.
4. Restore ke instance terpisah bila memungkinkan.
5. Validasi data dan aplikasi.
6. Ganti produksi setelah validasi.
7. Catat di audit.

Jangan menjalankan restore langsung ke produksi tanpa backup dan approval.

## 12. Monitoring platform sendiri

- Uptime per komponen.
- Latency dan error rate API.
- Kode bisnis: `0002`, `0003`, `0006`, `0100`, `0900`.
- Koneksi pool database.
- Outbox pending dan job gagal.
- Agent offline dan sertifikat hampir kedaluwarsa.
- Disk, inode, memori, CPU.
- Backup sukses/gagal.
- Hash chain audit valid.
- Waktu server.

SLO awal:

| Metrik | Target |
|---|---|
| Availability portal | 99.5% per bulan |
| Latency p95 API baca | < 500 ms |
| RPO database | ≤ 15 menit |
| RTO portal | ≤ 4 jam |
| Restore diuji | Per kuartal |

## 13. Runbook

Ringkasan severity, ambang default, routing, dan eskalasi ada di [alert-dan-eskalasi.md](alert-dan-eskalasi.md).

### 13.1 Login gagal massal

1. Cek health `osc_rest` dan database.
2. Cek rate limit/WAF.
3. Cek koneksi HRIS jika login HRIS.
4. Cek jam server dan sertifikat.
5. Cek lonjakan kode `AA00-00-0002`/`AB-*`.
6. Jika serangan, aktifkan pembatasan tambahan dan pantau audit.

### 13.2 HRIS tidak tersedia

1. Konfirmasi status koneksi di AM.
2. Cek timeout/circuit breaker.
3. Jika kebijakan fail-closed, login HRIS ditolak dengan pesan ramah.
4. Jangan mengaktifkan fallback lokal tanpa persetujuan keamanan.
5. Catat insiden dan komunikasikan.

### 13.3 Database primary down

1. Aktifkan failover ke standby sesuai prosedur.
2. Arahkan PgBouncer/aplikasi.
3. Validasi replikasi dan data.
4. Cek penyebab.
5. Setelah pulih, kembalikan topologi normal.
6. Catat RPO/RTO aktual.

### 13.4 Agent offline

1. Cek heartbeat dan versi agent.
2. Cek DNS/443/sertifikat/jam.
3. Cek buffer dan disk agent.
4. Cek collector dan rate limit.
5. Jika perlu, re-enroll atau cabut agent.

### 13.5 Sertifikat kedaluwarsa

1. Cek tanggal dan issuer.
2. Perpanjang/renew.
3. Terapkan melalui alur edge tervalidasi.
4. Validasi TLS dan chain.
5. Perbarui alert.

### 13.6 Deploy container gagal

1. Lihat plan, revision, dan log.
2. Cek image digest dan registry.
3. Cek resource host.
4. Rollback ke revisi sebelumnya.
5. Catat penyebab dan perbaikan.

### 13.7 MikroTik lockout

1. Jangan panik mengubah aturan lagi.
2. Gunakan jalur cadangan (console/VPN/agent lain).
3. Jalankan rollback snapshot pre-change.
4. Validasi koneksi manajemen.
5. Review rencana dan uji di lab.

### 13.8 Disk penuh

1. Identifikasi volume.
2. Hentikan job non-kritis.
3. Bersihkan log/rotasi dan partisi metrik lama sesuai retensi.
4. Jangan menghapus audit tanpa prosedur.
5. Tambah kapasitas dan alert.

### 13.9 Insiden keamanan

1. Ikuti [security/README.md](../security/README.md).
2. Isolasi sesi/token/agent.
3. Simpan bukti log/audit.
4. Investigasi.
5. Pulihkan dari backup bersih bila perlu.
6. Postmortem dan perbaikan.

## 14. Hardening host produksi

- [ ] Update dan reboot terjadwal.
- [ ] SSH key only, root login off, akses via bastion.
- [ ] Firewall default deny.
- [ ] Hanya 443 publik.
- [ ] auditd, AppArmor, fail2ban.
- [ ] NTP aktif.
- [ ] Disk terpisah dan monitoring.
- [ ] Docker/Podman rootless bila mungkin.
- [ ] Image dipin dan ditandatangani.
- [ ] Secret file 0400/0640.
- [ ] Log rotation.
- [ ] Backup otomatis dan restore diuji.
- [ ] Wazuh/agent keamanan.
- [ ] Akses admin MFA.

## 15. Kapasitas dan retensi

- Metrik raw 30 hari, rollup 1 tahun.
- Audit minimal 2 tahun (sesuai kebijakan).
- Login attempt 180 hari.
- Job run 90 hari.
- Notifikasi 90 hari.
- File mengikuti klasifikasi.
- Pantau pertumbuhan tabel dan partisi.
- Kapasitas database minimal 30% headroom.
- Uji beban ingestion agent sebelum onboarding besar.

## 16. Disaster recovery

- Dokumentasikan daftar aset, dependensi, dan kontak.
- Simpan konfigurasi infrastruktur di repositori terpisah.
- Simpan kunci dan secret di lokasi pemulihan.
- Uji skenario kehilangan host utama.
- Target RTO/RPO ditinjau per kuartal.
- Setelah DR test, catat waktu aktual dan perbaiki.

## 17. Change management

Pipeline build, tes, scan, dan promosi diatur di [ci-cd.md](ci-cd.md).

- Perubahan produksi melalui review dan jadwal.
- Perubahan auth, database, firewall, dan deploy memerlukan approval.
- Maintenance window untuk perubahan berisiko.
- Rollback plan wajib.
- Komunikasi ke pengguna.
- Catat perubahan di audit dan changelog.

## 18. Checklist go-live

- [ ] Migrasi diuji.
- [ ] Backup dan restore diuji.
- [ ] TLS dan header keamanan.
- [ ] Login lokal + HRIS diuji.
- [ ] Dua tenant terisolasi.
- [ ] Agent terdaftar dan terpantau.
- [ ] Alert dan notifikasi bekerja.
- [ ] Audit trail valid.
- [ ] Rate limit dan WAF aktif.
- [ ] Observability aktif.
- [ ] Katalog `en`/`id` paritas dan bahasa per pengguna diuji.
- [ ] Runbook tersedia.
- [ ] Pentest/temuan kritis ditutup.

## 19. Dokumen terkait

- [Alert dan eskalasi](alert-dan-eskalasi.md)
- [Impor dan migrasi data](impor-data.md)
- [CI/CD dan gerbang rilis](ci-cd.md)
- [Keamanan](../security/README.md)
- [Matriks izin](../security/matriks-izin.md)
- [Agent](../technical/agent/README.md)
- [Database dan migrasi](../technical/database/prisma-dan-migrasi.md)
- [UAT global](../qaqc/acceptance/README.md)
