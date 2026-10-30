# Referensi Aplikasi Nyata

Aplikasi berikut menjadi acuan fungsi dan pengalaman pengguna. OmniSight **tidak menyalin kode** dari aplikasi tersebut. Setiap integrasi wajib ditinjau lisensi, keamanan, dan biaya operasionalnya.

> Catatan lisensi: lisensi proyek pihak ketiga dapat berubah. Verifikasi lisensi versi yang benar-benar dipakai sebelum distribusi komersial. Jika ragu, gunakan integrasi melalui API tanpa menyalin kode.

## 1. Ringkasan pemetaan

| Aplikasi | Fokus | Modul OmniSight | Keputusan awal |
|---|---|---|---|
| [Directus](https://github.com/directus/directus) | CMS, notifikasi, akses, riwayat | AK, AB, AL | Konten native sederhana; adapter Directus opsional |
| [Beszel](https://github.com/henrygd/beszel) | Monitoring host, Docker, Podman | AE, AF | Agent host/container native; impor metrik opsional |
| [Dockge](https://github.com/louislam/dockge) | Deploy dan maintenance container | AF | Konsep stack; operasi native lewat agent |
| [Arcane](https://github.com/getarcaneapp/arcane) | Container dan host ops | AF | Konsep operasi; adapter opsional |
| [Nginx-UI](https://github.com/0xJacky/nginx-ui) | Domain, sertifikat, proxy | AG | Fitur native dengan template dan validasi |
| [LibreNMS](https://github.com/librenms/librenms) | Monitoring MikroTik/SNMP | AE | Adapter opsional |
| [Oxidized](https://github.com/ytti/oxidized) | Backup konfigurasi | AH | Fitur native bergaya Oxidized; adapter opsional |
| RouterOS API | Maintenance MikroTik/firewall | AD | Adapter native Rust + agent terisolasi |
| [Wazuh](https://github.com/wazuh/wazuh) | Monitoring keamanan host | AE, AL | Integrasi SIEM, bukan dibangun ulang |
| [JumpServer](https://github.com/jumpserver/jumpserver) | Bastion SSH/RDP/SFTP | AI | Integrasi untuk sesi/rekaman |
| [Snipe-IT](https://github.com/grokability/snipe-it) | Aset fisik dan riwayat | AC | Aset native; sinkronisasi opsional |
| [NetBox](https://github.com/netbox-community/netbox) | Jaringan, IPAM, rack, VLAN | AD | IPAM native; sinkronisasi opsional |
| [GLPI](https://github.com/glpi-project/glpi) | Helpdesk, kontrak, layanan | AJ | Tiket native; sinkronisasi GLPI opsional |

## 2. Rincian per aplikasi

### Directus

- **Yang diambil sebagai acuan**: model konten fleksibel, notifikasi, riwayat perubahan, pemisahan peran.
- **Yang dibangun di OmniSight**: artikel internal, halaman publik sederhana, template notifikasi, riwayat delivery, preferensi pengguna.
- **Integrasi opsional**: Directus sebagai headless CMS untuk klien yang butuh alur editorial kompleks. OmniSight membaca konten lewat REST/GraphQL Directus dan menyimpan referensi, bukan menyalin seluruh data.
- **Keamanan**: token integrasi disimpan di vault, scope minimal, akses baca saja untuk konten publik, webhook diverifikasi tanda tangannya.
- **Risiko**: lisensi dan biaya fitur enterprise, duplikasi otorisasi. Jangan jadikan Directus sumber kebenaran hak akses OmniSight.

### Beszel

- **Acuan**: monitoring ringan, agent host, metrik container, grafik sederhana, alert.
- **Native OmniSight**: agent Go mengirim heartbeat dan metrik host/container; `osc_auto` collector memvalidasi; `osc_rest` menyimpan; alert dievaluasi terjadwal.
- **Integrasi opsional**: impor metrik/status dari hub Beszel bila klien sudah memakainya. Hindari dua agent yang mengukur hal sama pada satu host.
- **Keamanan**: agent outbound-only, token per agent, payload dibatasi, metrik tidak memuat nama file sensitif atau environment variable.

### Dockge

- **Acuan**: pengelolaan stack compose, start/stop, log, pembaruan.
- **Native OmniSight**: stack, plan deploy, validasi compose, approval, rollback, log, status.
- **Perbedaan penting**: OmniSight tidak memberi akses bebas ke shell host. Operasi memakai API Docker/Podman melalui socket proxy yang dibatasi.
- **Keamanan**: image dipin digest, tidak ada `privileged: true` tanpa approval khusus, secrets memakai file/secret manager, resource limit.

### Arcane

- **Acuan**: gabungan monitoring host dan operasi container.
- **Native OmniSight**: data host, endpoint container, status, image, volume, network, aksi maintenance.
- **Integrasi opsional**: Arcane API sebagai sumber data bila sudah ada. Tetap gunakan audit dan persetujuan OmniSight untuk aksi.

### Nginx-UI

- **Acuan**: pengelolaan domain, sertifikat, proxy host, reload Nginx.
- **Native OmniSight**: model domain, sertifikat, proxy host, edge node, template config, validasi `nginx -t`, reload atomik, rollback.
- **Aturan**: tidak ada editor konfigurasi Nginx bebas untuk pengguna biasa. Perubahan lewat template dan validasi.
- **Keamanan**: private key sertifikat disimpan terenkripsi, akses dibatasi, auto-renew dengan pengawasan, notifikasi kedaluwarsa.

### LibreNMS

- **Acuan**: polling SNMP perangkat jaringan, khususnya MikroTik, grafik, alert.
- **Integrasi**: OmniSight menyimpan inventaris dan tautan ke LibreNMS; polling dapat dilakukan agent jaringan atau LibreNMS yang sudah ada.
- **Sumber kebenaran**: inventaris perangkat di OmniSight; metrik historis boleh di LibreNMS. Sinkronisasi harus satu arah atau memiliki aturan konflik yang jelas.
- **Keamanan**: API token read-only, TLS, segmentasi jaringan manajemen.

### Oxidized

- **Acuan**: backup konfigurasi perangkat, diff, retensi, output git.
- **Native OmniSight**: sumber konfigurasi, jadwal, snapshot, checksum, diff, restore dengan approval.
- **Integrasi opsional**: membaca repository output Oxidized atau memicu backup lewat API/CLI terbatas.
- **Keamanan**: konfigurasi perangkat mengandung informasi sensitif; simpan terenkripsi, akses read-only, restore memerlukan persetujuan.

### RouterOS API (MikroTik)

- **Acuan**: maintenance perangkat, firewall, alamat IP, route, diagnostik.
- **Native OmniSight**: adapter Rust ke RouterOS REST API (v7) atau API 8728/8729 melalui tunnel aman.
- **Aturan wajib**:
  - API tidak terbuka ke internet; hanya melalui WireGuard/VPN atau agent di lokasi.
  - Pengguna read-only untuk monitoring; pengguna write hanya aktif selama perubahan yang disetujui.
  - Rencana perubahan, diff, snapshot, approval, dan rollback otomatis bila koneksi manajemen terputus.
  - Tidak ada eksekusi perintah bebas dari UI.
- **Keamanan**: kredensial di vault, rotasi berkala, logging semua perintah yang diizinkan.

### Wazuh

- **Acuan**: monitoring keamanan host, file integrity, deteksi intrusi, active response.
- **Integrasi**: OmniSight menampilkan alert, status agent, dan menghubungkan ke Wazuh Manager/Indexer. OmniSight tidak membangun ulang mesin deteksi.
- **Active response**: wajib approval, allowlist aksi, dan audit. Default read-only.
- **Keamanan**: API Wazuh tidak diekspos publik, token read-only untuk dashboard, TLS, segmentasi.

### JumpServer

- **Acuan**: bastion SSH/RDP/SFTP, rekaman sesi, kontrol akses.
- **Integrasi**: OmniSight mengelola target, permintaan akses, approval, durasi, dan audit; eksekusi sesi dan rekaman dilakukan JumpServer.
- **Keamanan**: MFA wajib, approval untuk target produksi, rekaman disimpan terenkripsi, sesi kedaluwarsa otomatis.
- **Keputusan**: jangan membangun bastion sendiri pada tahap awal.

### Snipe-IT

- **Acuan**: aset fisik, serial, penempatan, penanggung jawab, check-out, riwayat.
- **Native OmniSight**: model aset dan alur check-out/in dengan scope perusahaan/area.
- **Integrasi opsional**: sinkronisasi dua arah terbatas; tentukan sumber kebenaran. Rekomendasi: OmniSight sebagai sumber kebenaran untuk tenant OmniSight; Snipe-IT hanya untuk klien yang sudah memakainya.
- **Keamanan**: API token scoped, pemetaan field eksplisit, jangan mengirim data pribadi yang tidak perlu.

### NetBox

- **Acuan**: perangkat, site, rack, IPAM, VLAN, koneksi.
- **Native OmniSight**: inventaris dan IPAM dengan relasi ke aset dan audit.
- **Integrasi opsional**: impor/ekspor lewat API NetBox; pemetaan site/rack/device harus eksplisit.
- **Keamanan**: token read-only untuk impor; tulis hanya jika disetujui dan dicatat.

### GLPI

- **Acuan**: helpdesk, tiket, kontrak, vendor, knowledge base.
- **Native OmniSight**: tiket, kategori, SLA, komentar, riwayat, kontrak dasar.
- **Integrasi opsional**: sinkronisasi tiket dan kontrak dengan GLPI. Untuk kebutuhan ITSM penuh, GLPI tetap alat utama dan OmniSight menjadi pintu masuk.
- **Keamanan**: API token terbatas, validasi data masuk, jangan menyimpan lampiran sensitif tanpa pemindaian.

### HRIS (integrasi khusus)

- **Fitur**: login pengguna memakai kredensial HRIS, request/response lewat backend, aturan sukses/gagal dinamis, mapping user dan role.
- **Dukungan**: POST dan GET, header kustom, JSON path mapping, status code mapping, timeout, retry terbatas, circuit breaker.
- **Keamanan**: password tidak pernah disimpan/di-log, TLS wajib, allowlist host HRIS, proteksi SSRF, rate limit, pesan gagal generik ke pengguna.
- **Fallback**: kebijakan per perusahaan. Default fail-closed untuk pengguna HRIS; fallback lokal hanya jika diaktifkan eksplisit dan dilindungi MFA.

## 3. Prinsip build vs integrate

Gunakan aturan berikut sebelum menambah integrasi:

1. Apakah data harus menjadi sumber kebenaran OmniSight? Jika ya, bangun native.
2. Apakah alat pihak ketiga sudah matang dan klien sudah memakainya? Jika ya, integrasikan.
3. Apakah integrasi menambah risiko keamanan baru? Jika ya, tunda sampai kontrol tersedia.
4. Apakah lisensi mengizinkan penggunaan dan distribusi? Jika tidak jelas, jangan salin kode.
5. Apakah ada dua sumber kebenaran? Jika ya, tentukan arah sinkronisasi dan aturan konflik.

## 4. Pola adapter

Setiap integrasi berada di `osc_rest` sebagai adapter dengan kontrak yang sama:

```text
Application use case
        │
        ▼
Port (trait Rust)
        │
        ├── HrisPort
        ├── RouterOsPort
        ├── ContainerEnginePort
        ├── MonitoringProviderPort
        ├── CmdbPort
        ├── ItsmPort
        ├── BastionPort
        └── CmsPort
        │
        ▼
Adapter eksternal (HTTP/API/CLI)
```

Aturan adapter:

- Timeout, retry dengan backoff, circuit breaker.
- Idempotency key untuk operasi tulis.
- Tidak pernah mencatat token/password di log.
- Error eksternal dipetakan ke kode OmniSight yang stabil.
- Kredensial hanya berupa referensi vault.
- Semua panggilan keluar melewati allowlist dan proteksi SSRF.
