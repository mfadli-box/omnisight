# Tata Kelola Dokumentasi dan Perubahan

## 1. Tujuan

Tata kelola memastikan dokumentasi, kode, database, API, dan keamanan tetap konsisten saat proyek bertambah besar dan dikerjakan banyak orang.

## 2. Kepemilikan dokumen

| Area | Pemilik | Reviewer wajib |
|---|---|---|
| Produk dan modul | Product Lead | Tech Lead, Security |
| Panduan pengguna | Product Lead | QA, Security |
| Glosarium | Product Lead | Tech Lead |
| Database | Data/Backend Lead | Security, Ops |
| Backend/API | Backend Lead | Frontend Lead, Security |
| Agent | Platform/OS Lead | Security, Ops |
| Frontend | Frontend Lead | Product, Backend |
| Spesifikasi UI | Frontend Lead | Product, Security |
| Unit test | Lead per peran | Tech Lead, Security |
| Fungsi komponen | Product + Tech Lead | Security |
| Alur data | Tech Lead | Security, Ops |
| Matriks izin | Security Lead | Backend Lead, Product |
| Registry kode error | Backend Lead | Frontend Lead, Security |
| UAT dan penerimaan | QA Lead | Product, Security |
| Keamanan | Security Lead | Tech Lead |
| Operasi | DevOps Lead | Security, Backend |
| Rencana implementasi | Tech Lead | Product, QA, Security |
| Alert dan eskalasi | DevOps Lead | Security, NOC |
| Impor data | DevOps Lead | Data/Backend Lead, Security |
| Tata kelola | Tech Lead | Semua lead |

Satu dokumen tidak boleh disetujui tanpa reviewer yang relevan.

## 3. Status dokumen

- **Draft**: bebas berubah.
- **Review**: menunggu komentar.
- **Disetujui**: menjadi acuan implementasi.
- **Usang**: digantikan, tetap disimpan untuk jejak.

Setiap perubahan besar mencantumkan:

- Tanggal.
- Ringkasan perubahan.
- Alasan.
- Dampak ke database/API/menu/agent.
- Rencana migrasi atau kompatibilitas.

## 4. Kode modul AA

Aturan:

1. `AA00` dipakai untuk kode sistem/global, misalnya `AA00-00-0003`.
2. Modul utama memakai dua huruf berurutan: `AA`, `AB`, sampai `AM`.
3. Submenu memakai kode modul + dua digit, misalnya `AA01` dan `AB03`.
4. Izin memakai `<kode>:read` atau `<kode>:post`.
5. Kode error modul memakai `<modul>-<submenu>-<nomor>`, misalnya `AB-04-1001`.
6. Kode yang sudah dipakai tidak boleh digunakan ulang.
7. Modul baru memakai huruf kosong berikutnya.
8. Modul yang dipensiunkan ditandai `deprecated`, tidak dihapus.
9. Kode modul muncul di dokumentasi, izin, audit, dan OpenAPI.

Registri saat ini:

| Kode | Modul | Status |
|---|---|---|
| AA | Dashboard | Aktif |
| AB | Identitas, Organisasi, Akses | Aktif |
| AC | Manajemen Aset | Aktif |
| AD | Jaringan dan IPAM | Aktif |
| AE | Monitoring Infrastruktur | Aktif |
| AF | Operasi Container | Aktif |
| AG | Edge, Domain, Sertifikat | Aktif |
| AH | Backup dan Konfigurasi | Aktif |
| AI | Akses Aman | Aktif |
| AJ | Layanan dan Kontrak | Aktif |
| AK | Konten dan Notifikasi | Aktif |
| AL | Audit dan Keamanan | Aktif |
| AM | Pengaturan Platform | Aktif |

### 4.1 Konvensi lokalisasi

- Bahasa yang didukung: `en` (default) dan `id`.
- Setiap pengguna dapat memilih bahasa; nilai disimpan di `core.users.locale`.
- Kode error, kode modul, dan kode status tidak diterjemahkan.
- Katalog backend: `osc_rest/locales/en.json` dan `id.json`.
- Katalog frontend: `osc_site/messages/en.json` dan `id.json`.
- Kunci terjemahan memakai dot.case dan stabil: `auth.invalid_credentials`, `validation.required`, `module.assets.title`.
- Mengubah teks tidak mengubah kunci; menghapus kunci adalah perubahan yang merusak dan harus lewat RFC.
- Setiap string baru wajib ditambahkan ke `en` dan `id` dalam perubahan yang sama; CI memeriksa paritas kunci.
- Placeholder memakai nama, bukan posisi, dan mendukung plural/select ICU.
- Nilai terjemahan tidak boleh memuat HTML, rahasia, atau data pribadi.
- Kunci yang hilang jatuh ke `en`, dicatat di log pengembangan, dan tidak menghasilkan error pengguna.
- Tanggal dan angka dikirim API dalam ISO 8601/nilai mentah; format tampilan dilakukan frontend sesuai locale.
- Perubahan default bahasa atau penambahan locale baru memerlukan RFC dan review produk.

## 5. Registri izin

Setiap izin baru wajib:

- Memakai modul yang sudah terdaftar atau mendaftarkan modul baru.
- Menjelaskan aksi `read`/`post`.
- Menjelaskan apakah sensitif.
- Menjelaskan scope (perusahaan/area).
- Dicatat di seed permission.
- Diuji di backend dan frontend.
- Dicantumkan di dokumentasi modul.
- Dicatat di [matriks izin](../security/matriks-izin.md) dan memiliki skenario UAT.

Izin sensitif minimal:

- Firewall change.
- Restore backup.
- Deploy/rollback produksi.
- Akses bastion.
- Kredensial/vault.
- Impersonasi.
- Ekspor audit.

## 6. Konvensi penamaan

| Konteks | Aturan | Contoh |
|---|---|---|
| Skema DB | snake_case | `service_desk` |
| Tabel | plural snake_case | `access_reviews` |
| Kolom | snake_case | `company_id` |
| Constraint | `fk_`, `uq_`, `ck_`, `ix_` | `fk_assets_location` |
| API | kebab-case | `/service-desk/tickets` |
| Modul | dua huruf | `AJ` |
| Izin | `<kode>:<aksi>` | `AJ:post` |
| Kunci terjemahan | dot.case | `auth.invalid_credentials` |
| Locale | ISO 639-1 | `en`, `id` |
| Kode fungsi | `<peran>-F-nn` | `AG-F-06` |
| React | PascalCase | `TicketTable` |
| File TS | kebab-case | `ticket-table.tsx` |
| Rust | snake_case | `plan_firewall_change` |
| Go | mixedCaps | `RunCollector` |
| Env | SCREAMING_SNAKE_CASE | `OSC_COLLECTOR_URL` |

## 7. Klasifikasi data

| Kelas | Contoh | Penanganan |
|---|---|---|
| Publik | Blog, halaman status | Boleh publik |
| Internal | Inventaris, tiket tanpa data sensitif | Perlu login |
| Rahasia | Kredensial, konfigurasi firewall, audit | Akses terbatas, enkripsi |
| Sangat rahasia | Kunci vault, private key, rekaman bastion | Vault + approval + audit |

Aturan:

- Data pribadi diminimalkan.
- Jangan memakai data nyata di dokumen/contoh.
- Retensi dan penghapusan mengikuti kebijakan.
- Ekspor memerlukan izin dan alasan.

## 8. RFC dan ADR

### RFC

Dipakai untuk perubahan besar:

- Auth/otorisasi.
- Skema database.
- Kontrak API yang memutus kompatibilitas.
- Integrasi eksternal baru.
- Perubahan keamanan.
- Perubahan deployment.

RFC berisi:

- Masalah.
- Usulan.
- Alternatif.
- Dampak.
- Rencana migrasi.
- Risiko keamanan.
- Rencana pengujian.

### ADR

Keputusan yang sudah diambil dicatat di [keputusan-arsitektur.md](keputusan-arsitektur.md). ADR bersifat ringkas dan tidak diubah tanpa alasan; keputusan baru dapat menggantikan yang lama.

## 9. Definition of Ready

Fitur siap dikerjakan jika:

- Kode modul dan izin jelas.
- Alur pengguna dan error state jelas.
- Dampak database/API jelas.
- Scope tenant/area jelas.
- Risiko keamanan awal sudah diidentifikasi.
- Teks UI baru dan terjemahan `en`/`id` sudah disepakati.
- Kriteria penerimaan dapat diuji.
- Desain UI kasar tersedia untuk fitur besar.

## 10. Definition of Done

Fitur selesai jika:

- Kode dan tes lulus.
- OpenAPI dan klien diperbarui.
- Migrasi diuji.
- Izin dan audit diuji.
- Dua tenant terisolasi.
- Tidak ada 403/5xx aplikasi.
- UI dapat diakses dan responsif.
- Label dan pesan tersedia di `en` dan `id` dengan paritas kunci; tidak ada teks UI hardcoded.
- Dokumentasi fungsi, alur data, dan unit test diperbarui.
- Matriks izin diperbarui dan diuji.
- UAT modul lulus dengan bukti terlampir.
- Dokumentasi diperbarui.
- Security checklist lulus.
- Observability (log/metrik) tersedia.
- Rollback plan tersedia untuk aksi berisiko.

## 11. Review keamanan

Review wajib untuk:

- Perubahan autentikasi/otorisasi.
- Perubahan query tenant.
- Integrasi baru.
- Aksi yang mengeksekusi perangkat/container.
- Perubahan enkripsi/secret.
- Perubahan audit.
- Perubahan dependency kritis.

Security sign-off mencatat:

- Risiko yang diterima.
- Mitigasi.
- Pemilik risiko.

## 12. Lisensi dan kekayaan intelektual

- Aplikasi referensi hanya menjadi acuan fungsi, bukan sumber kode.
- Jangan menyalin kode tanpa memeriksa lisensi.
- Catat lisensi dependency dan integrasi.
- Hindari dependency dengan lisensi yang tidak kompatibel.
- Simpan SBOM.
- Review hukum jika distribusi komersial.

## 13. Versioning

- Dokumen: `0.x` selama draft, `1.0` saat disetujui.
- API: `/api/v1`, perubahan besar ke `v2`.
- Database: forward-only migration, expand-contract.
- Agent: semver; compose memakai versi/digest.
- Image: pin digest.
- Perubahan yang merusak harus memiliki periode transisi.

## 14. Dokumentasi template

Setiap dokumen teknis minimal memuat:

1. Tujuan.
2. Ruang lingkup.
3. Diagram atau tabel.
4. Aturan dan keputusan.
5. Risiko dan mitigasi.
6. Checklist.
7. Referensi terkait.

## 15. Ritme review

- Review dokumen: setiap milestone.
- Review akses: per kuartal.
- Review backup/restore: per kuartal.
- Review dependency kritis: bulanan.
- Pentest: sebelum go-live dan minimal tahunan.
- Postmortem: setelah insiden signifikan.

## 16. Larangan dokumentasi

- Jangan menulis password, token, private key, atau kredensial.
- Jangan menulis data pribadi nyata.
- Jangan menulis alamat internal yang sensitif tanpa kebutuhan.
- Jangan menyalin kode berlisensi tanpa izin.
- Jangan membiarkan dokumen bertentangan dengan kode; perbarui keduanya.

## 17. Glosarium

| Istilah | Arti |
|---|---|
| Tenant | Perusahaan yang datanya terisolasi |
| Area | Pembagian organisasi dalam perusahaan |
| Scope | Batas data yang boleh diakses |
| Read/Post | Dua aksi izin utama |
| Sensitive action | Aksi berisiko yang butuh approval |
| Outbox | Tabel event untuk pengiriman andal |
| Agent | Program di host klien |
| Collector | Penerima data agent |
| RLS | Row Level Security PostgreSQL |
| mTLS | Mutual TLS |
| ADR | Architecture Decision Record |
| SBOM | Software Bill of Materials |
| Locale | Pilihan bahasa pengguna; `en` atau `id` |
| Katalog pesan | Berkas terjemahan berkunci stabil |
| RPO/RTO | Batas kehilangan data / waktu pemulihan |
