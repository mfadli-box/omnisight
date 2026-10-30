# Peta Modul dan Menu AA

Dokumen ini adalah acuan tunggal untuk penomoran modul, menu, path API, dan rute frontend. Matriks izin rinci ada di [security/matriks-izin.md](../security/matriks-izin.md). Kode modul memakai dua huruf berurutan (`AA`, `AB`, …), dan submenu memakai kode modul diikuti dua digit.

## 1. Aturan penomoran

| Bentuk | Arti | Contoh |
|---|---|---|
| `AA00` | Kode sistem/portal | Kode error global `AA00-00-xxxx` |
| `AA`–`AM` | Modul utama | `AC` Manajemen Aset |
| `<modul><nn>` | Submenu | `AC02` Aset Fisik |
| `<modul>:read` | Izin baca modul | `AC:read` |
| `<modul>:post` | Izin tulis/aksi modul | `AC:post` |
| `<modul><nn>:read/post` | Izin submenu sensitif | `AD06:read/post` |

Aturan:

- Kode modul tidak boleh dipakai ulang setelah dipensiunkan.
- Modul baru memakai huruf kosong berikutnya, bukan menggeser huruf lama.
- Izin diberikan pada modul; submenu hanya punya izin tambahan bila aksi berbeda risiko, misalnya firewall dan restore.
- Semua aksi `post` dicatat di audit. Aksi sensitif wajib persetujuan.
- Label UI dan pesan tersedia dalam bahasa Inggris (default) dan Indonesia; setiap pengguna dapat memilih bahasanya sendiri.
- Kode modul, kode error, dan kode status tidak diterjemahkan.
- Izin submodul sensitif menggantikan izin modul untuk submenu tersebut; daftar lengkap ada di [matriks izin](../security/matriks-izin.md).

## 2. Ringkasan modul

| Kode | Modul | Path API | Rute UI | Referensi utama |
|---|---|---|---|---|
| AA | Dashboard | `/api/v1/dashboard` | `/dashboard` | Semua aplikasi |
| AB | Identitas, Organisasi, Akses | `/api/v1/identity` | `/identity` | Directus, HRIS |
| AC | Manajemen Aset | `/api/v1/assets` | `/assets` | Snipe-IT |
| AD | Jaringan dan IPAM | `/api/v1/network` | `/network` | NetBox, RouterOS |
| AE | Monitoring Infrastruktur | `/api/v1/monitoring` | `/monitoring` | Beszel, LibreNMS, Wazuh |
| AF | Operasi Container | `/api/v1/containers` | `/containers` | Dockge, Arcane |
| AG | Edge, Domain, Sertifikat | `/api/v1/edge` | `/edge` | Nginx-UI |
| AH | Backup dan Konfigurasi | `/api/v1/backups` | `/backups` | Oxidized |
| AI | Akses Aman | `/api/v1/access` | `/access` | JumpServer |
| AJ | Layanan dan Kontrak | `/api/v1/service-desk` | `/service-desk` | GLPI |
| AK | Konten dan Notifikasi | `/api/v1/content` | `/content` | Directus |
| AL | Audit dan Keamanan | `/api/v1/audit` | `/audit` | Wazuh, Directus |
| AM | Pengaturan Platform | `/api/v1/platform` | `/settings` | Semua integrasi |

## 3. Rincian menu

### AA Dashboard

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AA01 | Ringkasan | Kartu aset, host, alert, tiket, deploy, sertifikat, tugas saya | `AA:read` |
| AA02 | Kesehatan Layanan | Status komponen OmniSight dan integrasi | `AA:read` |
| AA03 | Aktivitas Terbaru | Audit ringkas sesuai scope | `AA:read` |

Catatan: dashboard **tidak** menambah akses. Semua angka difilter dengan scope pengguna.

### AB Identitas, Organisasi, dan Akses

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AB01 | Perusahaan dan Area | CRUD perusahaan, area bertingkat, lokasi | `AB:post` |
| AB02 | Pengguna dan Undangan | Undang anggota, aktif/nonaktif, membership | `AB02:post` |
| AB03 | Peran dan Izin | Role, permission `read`/`post`, scope area | `AB03:post` |
| AB04 | Login HRIS | Koneksi HRIS, aturan sukses/gagal, mapping | `AB04:post` |
| AB05 | Sesi dan Perangkat | Daftar sesi, cabut sesi, kebijakan | `AB05:post` |
| AB06 | Riwayat Login | Login berhasil/gagal, alasan gagal | `AB06:read` |
| AB07 | Direktori | Cari anggota dalam scope | `AB:read` |

Fitur kunci:

- Satu pengguna dapat menjadi anggota beberapa perusahaan.
- Peran diberikan per membership dan per area.
- HRIS mendukung POST/GET, mapping field, mapping role, pesan gagal dinamis, dan fallback yang dikendalikan kebijakan.
- Login lokal memakai Argon2id; JWT berumur pendek; refresh token dirotasi.

### AC Manajemen Aset

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AC01 | Kategori dan Model | Kategori, manufacturer, model, spesifikasi | `AC:post` |
| AC02 | Aset Fisik | Aset, serial, tag, status, garansi, QR | `AC:post` |
| AC03 | Lokasi dan Penempatan | Perusahaan > area > lokasi | `AC:post` |
| AC04 | Check-out / Check-in | Serah terima, kondisi, tanggal kembali | `AC:post` |
| AC05 | Mutasi dan Riwayat | Perpindahan lokasi/penanggung jawab | `AC:read` |
| AC06 | Label dan QR | Cetak label, QR aman, cari aset | `AC:post` |
| AC07 | Laporan Aset | Ekspor, umur aset, garansi habis | `AC:read` |

Aturan akses:

- Aset selalu memiliki `company_id`, `area_id`, dan `location_id`.
- Lokasi harus berada di area dan perusahaan yang sama (dijaga foreign key komposit).
- Penanggung jawab harus anggota perusahaan tersebut.
- Riwayat tidak boleh dihapus.

### AD Jaringan dan IPAM

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AD01 | Site, Rack, dan Lokasi | Site, rack, unit, status | `AD:post` |
| AD02 | Perangkat Jaringan | Router, switch, AP, firewall, server | `AD:post` |
| AD03 | IPAM dan VLAN | Prefix, IP, VLAN, status alokasi | `AD:post` |
| AD04 | Topologi dan Koneksi | Link interface, kabel, circuit | `AD:read` |
| AD05 | Router MikroTik | Inventaris, health, versi RouterOS | `AD:post` |
| AD06 | Firewall dan Aturan | Baca aturan, rencana perubahan, approval | `AD06:post` |
| AD07 | Maintenance RouterOS | Diagnostik terbatas, snapshot, rollback | `AD07:post` |
| AD08 | Integrasi NetBox/LibreNMS | Sinkronisasi inventory dan status | `AD:post` |

Aturan keamanan:

- RouterOS API tidak boleh terbuka ke internet.
- Kredensial disimpan sebagai referensi vault, bukan teks biasa.
- Perubahan firewall memakai alur rencana → diff → persetujuan → snapshot → eksekusi → verifikasi → rollback otomatis bila koneksi manajemen hilang.
- Perintah bebas tidak tersedia dari UI; hanya aksi yang masuk allowlist.

### AE Monitoring Infrastruktur

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AE01 | Host dan Agent | Status host, versi agent, heartbeat | `AE:read` |
| AE02 | Metrik dan Grafik | CPU, RAM, disk, network, container | `AE:read` |
| AE03 | Alert dan Ambang Batas | Rule, severity, kanal notifikasi | `AE:post` |
| AE04 | Insiden | Acknowledge, assign, resolve, timeline | `AE:post` |
| AE05 | Integrasi LibreNMS | Sinkronisasi perangkat MikroTik/SNMP | `AE:post` |
| AE06 | Integrasi Wazuh | Kejadian keamanan, agent, active response | `AE06:post` |
| AE07 | Retensi Metrik | Kebijakan retensi dan agregasi | `AE:post` |

Referensi: Beszel untuk host/container, LibreNMS untuk SNMP/MikroTik, Wazuh untuk keamanan.

### AF Operasi Container dan Layanan

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AF01 | Endpoint | Docker/Podman host, status API, TLS | `AF:post` |
| AF02 | Stack dan Compose | Daftar stack, sumber compose, validasi | `AF:post` |
| AF03 | Layanan dan Container | Status, image, health, resource | `AF:read` |
| AF04 | Deploy dan Rollback | Plan, scan, approval, deploy, rollback | `AF04:post` |
| AF05 | Maintenance | Start/stop/restart terkontrol, log | `AF05:post` |
| AF06 | Gambaran Host | Disk, image, volume, jaringan | `AF:read` |

Aturan:

- Docker socket tidak boleh dipasang langsung ke container aplikasi. Gunakan socket proxy dengan endpoint allowlist.
- Compose divalidasi, image dipin ke digest, resource limit wajib untuk produksi.
- Deploy produksi memerlukan persetujuan dan menyimpan versi sebelumnya untuk rollback.

### AG Edge, Domain, dan Sertifikat

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AG01 | Domain | FQDN, registrar, masa berlaku, DNS | `AG:post` |
| AG02 | Sertifikat | Issuer, expiry, auto-renew, fingerprint | `AG:post` |
| AG03 | Proxy Host | Domain, upstream, TLS, header | `AG:post` |
| AG04 | Konfigurasi Nginx | Template, validasi, reload, rollback | `AG04:post` |
| AG05 | Edge Node | Agent edge, status, versi | `AG:post` |

Aturan: konfigurasi mentah tidak diedit bebas. UI memakai template tervalidasi, `nginx -t`, reload atomik, dan rollback.

### AH Backup dan Konfigurasi

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AH01 | Sumber Konfigurasi | Router, perangkat, Nginx, endpoint | `AH:post` |
| AH02 | Jadwal Backup | Cron, zona waktu, retensi | `AH:post` |
| AH03 | Snapshot dan Diff | Checksum, diff, unduh terenkripsi | `AH:read` |
| AH04 | Restore | Permintaan, persetujuan, eksekusi | `AH04:post` |
| AH05 | Verifikasi | Uji integritas dan restore berkala | `AH05:read/post` |

Referensi: Oxidized. Snapshot disimpan terenkripsi, memiliki checksum, dan tidak dapat diubah.

### AI Akses Aman (Bastion)

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AI01 | Target Akses | SSH, RDP, SFTP, host, port, role | `AI:post` |
| AI02 | Permintaan Akses | Alasan, waktu mulai/selesai, approval | `AI:post` (request) / `AI02:post` (approval) |
| AI03 | Sesi Aktif | Lihat dan cabut sesi | `AI:post` |
| AI04 | Rekaman dan Audit | Metadata dan tautan rekaman | `AI:read` |
| AI05 | Kebijakan Akses | MFA, durasi, jam kerja, approval | `AI05:post` |

Rekomendasi: integrasikan JumpServer untuk eksekusi sesi/rekaman; OmniSight mengelola permintaan, persetujuan, scope, dan audit. Membangun bastion sendiri tidak disarankan untuk tahap awal.

### AJ Layanan dan Kontrak (Helpdesk)

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AJ01 | Tiket | Buat, assign, komentar, status, SLA | `AJ:post` |
| AJ02 | Kategori dan SLA | Kategori, prioritas, kalender layanan | `AJ:post` |
| AJ03 | Kontrak dan Vendor | Kontrak, masa berlaku, nilai, dokumen | `AJ:post` |
| AJ04 | Knowledge Base | Artikel bantuan, visibilitas | `AJ:post` |
| AJ05 | Laporan Layanan | Volume tiket, SLA, kepuasan | `AJ:read` |

Referensi: GLPI. Mode awal: tiket native; sinkronisasi dua arah dengan GLPI bersifat opsional.

### AK Konten, Notifikasi, dan Pengetahuan

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AK01 | Artikel dan Halaman | Artikel internal, halaman publik | `AK:post` |
| AK02 | Blog dan Pengumuman | Publikasi, jadwal, status | `AK:post` |
| AK03 | Template Notifikasi | Email, webhook, in-app, variabel | `AK:post` |
| AK04 | Kirim dan Riwayat | Status kirim, retry, kegagalan | `AK:read` |
| AK05 | Preferensi Pengguna | Kanal dan jenis notifikasi | `AK:post` |

Referensi: Directus. Mode awal: konten native sederhana; Directus dapat menjadi adapter headless CMS opsional tanpa menjadi ketergantungan inti.

### AL Audit dan Keamanan

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AL01 | Audit Trail | Aktor, aksi, sebelum/sesudah, request ID | `AL:read` |
| AL02 | Login dan Akses | Login, sesi, penolakan izin | `AL:read` |
| AL03 | Kejadian Keamanan | Wazuh, alert keamanan, triase | `AL:post` |
| AL04 | Review Akses | Kampanye review per periode | `AL04:post` |
| AL05 | Ekspor dan Retensi | Ekspor aman, kebijakan retensi | `AL05:post` |

Catatan: penolakan akses tidak memakai HTTP 403, tetapi tetap dicatat sebagai kode `AA00-00-0003` dan dihitung sebagai metrik keamanan.

### AM Pengaturan Platform dan Integrasi

| Kode | Menu | Fitur kunci | Izin |
|---|---|---|---|
| AM01 | Integrasi dan Adapter | HRIS, LibreNMS, Wazuh, GLPI, NetBox, dll. | `AM:post` |
| AM02 | Kredensial dan Vault | Referensi rahasia, rotasi, uji koneksi | `AM02:post` |
| AM03 | Webhook dan API Key | Scope, expiry, audit pemakaian | `AM03:post` |
| AM04 | Scheduler | Job, jadwal, retry, concurrency | `AM:post` |
| AM05 | Pengaturan Platform | Nama, zona waktu, locale default perusahaan, kebijakan | `AM:post` |
| AM06 | Feature Flag | Aktivasi fitur per perusahaan | `AM:post` |
| AM07 | Branding dan Tema | Logo, warna, domain portal | `AM:post` |
| AM08 | Impersonasi dan Dukungan | Sesi dukungan platform, alasan, batas waktu, audit | `AM08:post` |

## 4. Level akses

| Peran contoh | Scope | Izin umum |
|---|---|---|
| Platform Owner | Global platform | Kelola perusahaan dan integrasi, tanpa melihat data bisnis tanpa impersonasi audit |
| Company Admin | Perusahaan | Semua modul perusahaan, kelola pengguna dan peran |
| Area Manager | Area + turunannya | Baca/tulis modul operasional di area |
| Operator NOC | Area | Baca monitoring/jaringan, post alert/insiden, deploy dengan approval |
| Teknisi | Area | Aset, tiket, check-out/in |
| Viewer | Area/perusahaan | Read saja |
| Auditor | Perusahaan | Read audit dan review akses |
| Requester | Diri sendiri | Tiket, permintaan akses, artikel |

Detail teknis otorisasi ada di [backend/topologi-dan-akses.md](../technical/backend/topologi-dan-akses.md), dan daftar izin lengkap ada di [security/matriks-izin.md](../security/matriks-izin.md).

## 5. Matriks modul dan referensi

| Modul | Bangun sendiri | Integrasi opsional | Alasan |
|---|---|---|---|
| Identitas dan akses | Ya | OIDC/SSO, HRIS | Harus menjadi inti dan sumber kebenaran |
| Aset | Ya | Snipe-IT | Scope perusahaan/area harus konsisten |
| Jaringan/IPAM | Ya | NetBox | Inventaris terhubung ke aset dan audit |
| Monitoring host/container | Ya | Beszel, LibreNMS | Metrik ringan dan alert terpadu |
| Container ops | Ya | Dockge, Arcane | Butuh approval dan audit terpusat |
| Edge/Nginx | Ya | Nginx-UI | Konfigurasi harus tervalidasi |
| Backup konfigurasi | Ya | Oxidized | Diff dan restore butuh kontrol akses |
| Bastion | Kelola alur | JumpServer | Rekaman sesi lebih aman memakai alat matang |
| Helpdesk | Ya (dasar) | GLPI | Tiket dasar terpadu; GLPI untuk ITSM penuh |
| CMS/notifikasi | Ya (dasar) | Directus | Konten sederhana; Directus untuk kebutuhan CMS lanjutan |
| Audit/SIEM | Ya (audit) | Wazuh | Audit aplikasi wajib; SIEM memakai Wazuh |

## 6. Menu global

Menu yang selalu tersedia di header:

- Pemilih perusahaan aktif.
- Pemilih area aktif (jika pengguna punya lebih dari satu area).
- Pencarian global sesuai scope.
- Notifikasi.
- Profil, keamanan akun, sesi.
- Pemilih bahasa (Inggris default, Indonesia), tersimpan per pengguna.
- Bantuan dan status layanan.

Menu yang hanya muncul untuk peran tertentu: Pengaturan Platform, Audit, Review Akses, Kredensial, Feature Flag.
