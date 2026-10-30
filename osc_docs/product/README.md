# Produk OmniSight

## 1. Ringkasan

OmniSight adalah portal DevSecOps satu pintu untuk tim IT, NOC, security, dan manajemen layanan. Portal ini menyatukan data organisasi, aset, jaringan, monitoring, operasi container, akses aman, backup konfigurasi, helpdesk, konten, dan audit ke dalam satu aplikasi.

OmniSight tidak bertujuan menggantikan semua alat khusus sekaligus. Pendekatan awalnya adalah:

- **Membangun inti yang memang perlu disatukan**: identitas, otorisasi, inventaris, audit, dashboard, alur persetujuan.
- **Mengintegrasikan alat yang sudah matang** jika klien sudah memilikinya, melalui adapter.
- **Menghindari duplikasi data dan duplikasi kebenaran**: satu sumber kebenaran untuk aset dan akses, integrasi hanya membaca/menyinkronkan.

## 2. Masalah yang ingin diselesaikan

1. Data pengguna, aset, jaringan, dan layanan tersebar di banyak aplikasi.
2. Hak akses tidak seragam dan sulit diaudit, terutama untuk banyak perusahaan dan area.
3. Tindakan berbahaya seperti ubah firewall, deploy container, atau restore backup sering tidak memiliki jejak persetujuan.
4. Tim harus membuka banyak dashboard untuk pekerjaan rutin.
5. Klien dan tim internal sulit membuktikan siapa melakukan apa, kapan, dan pada data perusahaan mana.
6. Login karyawan melalui HRIS sering berbeda-beda pola sukses/gagalnya.

## 3. Prinsip produk

1. **Satu pintu, banyak sumber**: OmniSight menjadi antarmuka utama, tetapi boleh mengambil data dari alat lain.
2. **Akses berdasarkan perusahaan dan area**: satu pengguna bisa menjadi anggota beberapa perusahaan, dengan peran dan area berbeda.
3. **Read dan Post**: setiap menu hanya memiliki izin baca (`read`) dan tulis (`post`). Tindakan sensitif tetap memerlukan persetujuan, alasan, dan audit.
4. **Jelas dan dapat ditelusuri**: setiap perubahan penting memiliki aktor, waktu, sebelum/sesudah, dan nomor permintaan.
5. **Aman secara bawaan**: pengguna tidak dapat melihat data di luar scope-nya, bahkan jika menebak ID.
6. **Tidak membocorkan informasi**: pesan error generik, kode stabil, dan detail teknis hanya di log internal.
7. **Dapat dioperasikan di Ubuntu dan Windows**: agent Go lintas platform; server utama di Ubuntu.
8. **Dual bahasa**: label dan pesan tersedia dalam bahasa Inggris dan Indonesia. Default bahasa Inggris; setiap pengguna dapat memilih bahasanya sendiri. Kode error tetap sama di semua bahasa.

## 4. Persona

| Persona | Kebutuhan utama | Modul yang sering dipakai |
|---|---|---|
| Pemilik platform / penyedia layanan | Mengelola banyak perusahaan, onboarding, limit, integrasi, audit global | AB, AL, AM |
| Admin perusahaan | Mengatur pengguna, area, peran, aset, dan layanan perusahaannya | AB, AC, AJ |
| Manajer area | Melihat dan mengelola aset, perangkat, dan tiket di areanya | AC, AD, AJ |
| Operator NOC | Memantau host, jaringan, container, dan alert | AE, AF, AD |
| Teknisi lapangan | Check-out/in aset, melihat lokasi, menangani tiket | AC, AJ |
| Analis keamanan | Meninjau login, audit, kejadian keamanan, akses | AL, AI |
| Auditor | Membaca bukti audit, review akses, ekspor laporan | AL |
| Karyawan / pemohon | Membuat tiket, meminta akses, membaca artikel | AJ, AI, AK |
| Kontak klien | Melihat layanan dan tiket perusahaannya | AJ, AA |

## 5. Ruang lingkup modul

Peta lengkap ada di [peta-modul.md](peta-modul.md). Ringkasnya:

1. **AA Dashboard**: ringkasan lintas modul sesuai scope pengguna.
2. **AB Identitas, Organisasi, Akses**: multi-perusahaan, area, pengguna, peran, HRIS, sesi, login history.
3. **AC Aset**: kategori, model, aset fisik, serial, penempatan, penanggung jawab, check-out/in, mutasi, QR.
4. **AD Jaringan**: site/rack, perangkat, interface, IPAM, VLAN, topologi, MikroTik, firewall.
5. **AE Monitoring**: host, agent, metrik, alert, insiden, integrasi LibreNMS/Wazuh.
6. **AF Container**: endpoint Docker/Podman, stack, layanan, deploy, rollback, log.
7. **AG Edge**: domain, sertifikat, proxy host, konfigurasi Nginx.
8. **AH Backup konfigurasi**: jadwal, snapshot, diff, restore dengan persetujuan.
9. **AI Akses aman**: target, permintaan akses, sesi, rekaman, kebijakan.
10. **AJ Layanan**: tiket, SLA, kontrak, vendor, knowledge base.
11. **AK Konten dan notifikasi**: artikel, blog, template notifikasi, delivery, preferensi.
12. **AL Audit dan keamanan**: audit trail, login, kejadian keamanan, review akses, retensi.
13. **AM Pengaturan platform**: integrasi, kredensial, webhook, API key, scheduler, branding.

Panduan penggunaan harian per peran ada di [panduan-pengguna.md](panduan-pengguna.md).

## 6. Ruang lingkup bertahap

### Tahap 0: Dokumentasi dan validasi

- Menyepakati modul, skema database, kontrak API, model akses, dan kebijakan keamanan.
- Menyiapkan threat model dan checklist rilis.
- Belum ada kode produksi.

### Tahap 1: Pondasi (MVP)

- Identitas: perusahaan, area, pengguna, peran, izin `read`/`post`, sesi, audit login.
- Login lokal dengan Argon2id + JWT.
- Login HRIS dengan aturan sukses/gagal dinamis, mendukung POST dan GET ke HRIS.
- Aset dasar: kategori, model, aset, lokasi, penanggung jawab, check-out/in, riwayat.
- Inventaris jaringan dasar: lokasi, rack, perangkat, interface, IP, VLAN.
- Agent host Ubuntu: heartbeat, CPU, RAM, disk, network.
- Dashboard, notifikasi dalam aplikasi, audit trail.
- Container: daftar endpoint, stack, status, deploy/rollback dengan persetujuan.

### Tahap 2: Operasi dan integrasi

- MikroTik: inventaris RouterOS, backup konfigurasi, firewall read, perubahan firewall dengan persetujuan dan rollback otomatis.
- Edge: domain, sertifikat, proxy host, validasi konfigurasi Nginx.
- Backup konfigurasi bergaya Oxidized dengan diff dan restore.
- Integrasi LibreNMS, Wazuh, GLPI, NetBox, Snipe-IT, JumpServer, sesuai kebutuhan klien.
- Agent Windows dan agent container/network.
- SLA, kontrak, knowledge base.

### Tahap 3: Skala dan tata kelola

- Laporan lintas perusahaan, ekspor audit, review akses berkala.
- Kebijakan retensi dan penghapusan data.
- Mode HA database, read replica, backup teruji.
- Integrasi SSO/OIDC dan passkey.
- Pengujian penetrasi eksternal dan program perbaikan berkelanjutan.

## 7. Bukan tujuan awal

- Bukan pengganti penuh SIEM, EDR, atau platform virtualisasi.
- Bukan alat untuk menyimpan password pengguna akhir dalam bentuk yang bisa dibaca.
- Bukan alat untuk menjalankan perintah shell bebas dari UI.
- Bukan pustaka kode dari aplikasi referensi; referensi hanya menjadi acuan fungsi dan pengalaman pengguna.
- Bukan sistem yang menjanjikan "tidak bisa diretas". Keamanan dicapai lewat lapisan kontrol, pengujian, dan operasi yang disiplin.

## 8. Metrik keberhasilan

| Metrik | Target awal |
|---|---|
| Onboarding perusahaan baru | < 1 hari kerja |
| Waktu mendeteksi alert host/container | < 5 menit |
| Waktu memproses permintaan akses | Terukur per SLA |
| Kelengkapan audit untuk aksi sensitif | 100% |
| Kebocoran lintas perusahaan | 0 kejadian |
| Restore backup teruji | Minimal 1 kali per kuartal |
| Temuan kritis sebelum rilis | 0 terbuka |

## 9. Asumsi dan batasan

- Host utama memakai Ubuntu; agent harus bisa berjalan di Ubuntu dan Windows.
- Deployment memakai Docker atau Podman dengan compose.
- Database PostgreSQL; Prisma hanya untuk skema dan migrasi.
- Backend Rust menjadi satu-satunya jalur tulis data domain.
- Frontend tidak pernah memegang kredensial database atau kunci integrasi.
- Semua contoh data dalam dokumen adalah placeholder, bukan data nyata.

## 10. Dokumen terkait

- [Peta modul dan menu](peta-modul.md)
- [Panduan pengguna dan admin](panduan-pengguna.md)
- [Glosarium](glosarium.md)
- [Matriks izin](../security/matriks-izin.md)
- [Peta menu frontend](../technical/frontend/peta-menu.md)
- [Spesifikasi UI](../technical/frontend/spesifikasi-ui.md)
- [UAT per modul](../qaqc/acceptance/README.md)
