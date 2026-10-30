# Glosarium OmniSight

Status: Disetujui (0.6)

Glosarium ini menyatukan istilah yang dipakai lintas dokumen produk, teknis, keamanan, operasi, dan QA/QC. Jika ada perbedaan istilah, dokumen ini menjadi rujukan; istilah baru harus ditambahkan di sini agar tidak muncul variasi.

## 1. Organisasi dan akses

| Istilah | Arti |
|---|---|
| **Tenant / Perusahaan** | Batas data organisasi. Setiap data tenant memiliki `company_id` dan tidak boleh terlihat oleh tenant lain. |
| **Area** | Pembagian di dalam perusahaan, dapat bertingkat. Akses area mencakup area turunannya. |
| **Lokasi** | Tempat fisik aset di dalam area, misalnya ruang, rak, atau gudang. |
| **Membership** | Hubungan pengguna dengan perusahaan, berisi peran dan status aktif. |
| **Scope** | Batas data yang boleh diakses: `global`, `company`, `area`, atau `self`. |
| **Peran (role)** | Kumpulan izin, misalnya `company_admin`, `area_manager`, `requester`. |
| **Izin (permission)** | Hak spesifik per modul atau submenu: `read` atau `post`. |
| **`read`** | Izin membaca data dalam scope. |
| **`post`** | Izin melakukan aksi tulis/aksi bisnis, bukan hanya HTTP POST. `post` mencakup `read` pada modul yang sama. |
| **Submodul** | Menu turunan modul dengan kode `<modul><nn>`, misalnya `AC04`. |
| **Submodul sensitif** | Submodul yang memakai izin sendiri dan tidak cukup dengan izin modul, misalnya `AD06`. |
| **Peran platform** | Peran lintas perusahaan untuk pengelola platform, disimpan terpisah dari membership perusahaan. |
| **Requester** | Peran pengguna yang membuat tiket, permintaan akses, dan membaca artikel untuk dirinya sendiri. |
| **Impersonasi** | Sesi dukungan platform atas nama pengguna lain, dengan alasan, MFA, batas waktu, banner, dan audit. |

## 2. Modul dan penomoran

| Istilah | Arti |
|---|---|
| **Modul** | Kelompok fungsi dengan kode dua huruf `AA`–`AM`. |
| **Kode global** | Kode sistem `AA00-00-xxxx`, misalnya `AA00-00-0003`. |
| **Kode modul** | Kode error `<modul>-<submenu>-<nomor>`, misalnya `AC-04-2001`. |
| **Kode fungsi** | Kode fungsi komponen `AG-F-nn`, `DB-F-nn`, `BE-F-nn`, `FE-F-nn`. |
| **Kode UAT** | ID skenario penerimaan `UAT-G-nn` atau `UAT-<modul>-nn`. |
| **Kode rule alert** | ID rule operasional `ALT-<domain>-nn`, misalnya `ALT-HOST-07`. |

## 3. API dan data

| Istilah | Arti |
|---|---|
| **Envelope** | Bentuk respons API yang selalu memuat `ok`, `code`, `message`, `data`, `meta`, dan `errors`. |
| **`request_id`** | Nomor unik satu request untuk menelusuri log dan audit. |
| **Idempotency** | Sifat operasi yang dapat diulang tanpa efek ganda; memakai idempotency key. |
| **Cursor pagination** | Paginasi berbasis penanda posisi, dipakai untuk daftar besar. |
| **Konflik versi** | Kondisi ketika data sudah diubah pihak lain sebelum perubahan disimpan. |
| **Soft delete / arsip** | Menandai data tidak aktif tanpa menghapus riwayat. |
| **Outbox** | Tabel event yang dikirim asinkron agar notifikasi/integrasi tidak hilang. |
| **RLS** | Row-Level Security PostgreSQL; lapisan kedua isolasi tenant. |
| **Foreign key komposit** | Kunci asing yang menyertakan `company_id` untuk mencegah relasi lintas tenant. |
| **Hash chain** | Rantai hash audit agar perubahan atau penghapusan diam-diam terdeteksi. |
| **Snapshot** | Salinan konfigurasi atau data pada waktu tertentu. |
| **Diff** | Perbandingan sebelum dan sesudah perubahan. |
| **Dry-run** | Simulasi impor/proses tanpa menulis data. |
| **Batch** | Satu kelompok data yang diproses bersama dan memiliki `batch_id`. |

## 4. Identitas dan keamanan

| Istilah | Arti |
|---|---|
| **MFA** | Autentikasi multifaktor, misalnya kode authenticator. |
| **Argon2id** | Algoritma hash password untuk login lokal. |
| **JWT** | Token sesi berumur pendek yang ditandatangani; refresh token dirotasi. |
| **Vault** | Penyimpanan rahasia; database hanya menyimpan referensi. |
| **mTLS** | TLS dua arah antara agent dan server. |
| **Least privilege** | Prinsip memberi akses minimum yang diperlukan. |
| **Approval** | Persetujuan pengguna lain untuk aksi sensitif. |
| **Dual control** | Dua approver berbeda untuk satu aksi berisiko tinggi. |
| **Self-approval** | Persetujuan atas permintaan sendiri; dilarang. |
| **Penolakan akses** | Keadaan saat izin/scope tidak cukup; memakai kode `AA00-00-0003`, bukan HTTP 403. |

## 5. Operasi

| Istilah | Arti |
|---|---|
| **Agent** | Program Go di host/container yang mengirim data keluar ke OmniSight. |
| **Collector** | Layanan `osc_auto` yang menerima metrik dan event agent. |
| **Edge** | Lapisan Nginx/Traefik + WAF yang menerima trafik publik. |
| **Heartbeat** | Sinyal berkala agent untuk menunjukkan status hidup. |
| **Alert** | Pemberitahuan kondisi yang melewati ambang rule. |
| **Fingerprint** | Identitas unik alert untuk deduplikasi. |
| **Severity** | Tingkat alert: `info`, `warning`, `critical`. |
| **Silence** | Penonaktifan notifikasi sementara dengan batas waktu dan alasan. |
| **Inhibisi** | Penekanan alert turunan saat alert induk sudah aktif. |
| **Insiden** | Catatan penanganan gangguan, berisi timeline, pemilik, dan resolusi. |
| **Runbook** | Langkah operasional untuk menangani kondisi tertentu. |
| **SLO** | Target tingkat layanan internal. |
| **RPO** | Batas kehilangan data yang dapat diterima saat gangguan. |
| **RTO** | Batas waktu pemulihan layanan. |
| **Maintenance window** | Jendela perawatan yang disetujui; alert dapat di-silence terbatas. |

## 6. Frontend dan bahasa

| Istilah | Arti |
|---|---|
| **Server Component** | Komponen Next.js yang dirender di server. |
| **Client Component** | Komponen Next.js yang berjalan di browser untuk interaksi. |
| **Server-first** | Pola mengambil data awal di server, interaksi lanjutan di klien. |
| **Scope badge** | Penanda perusahaan/area aktif pada header dan judul halaman. |
| **Locale** | Bahasa antarmuka: `en` (default) atau `id`. |
| **Fallback** | Nilai cadangan; kunci terjemahan yang hilang jatuh ke `en`. |
| **Paritas kunci** | Keadaan ketika katalog `en` dan `id` memiliki kunci yang sama. |
| **Hydration mismatch** | Ketidakcocokan render server dan klien; dihindari dengan locale dari cookie. |
| **WCAG AA** | Standar aksesibilitas yang menjadi target UI. |

## 7. QA/QC

| Istilah | Arti |
|---|---|
| **Unit test** | Tes logika murni tanpa layanan nyata. |
| **Integration test** | Tes yang menyentuh database, HTTP eksternal, atau filesystem. |
| **E2E** | Tes alur pengguna dari UI sampai backend. |
| **UAT** | User Acceptance Test per modul dengan bukti dan kriteria lulus. |
| **Skenario global** | `UAT-G-01` sampai `UAT-G-11` yang berlaku lintas modul. |
| **Temuan S1/S2/S3** | Tingkat keparahan temuan; S1/S2 menghalangi rilis. |
| **Regresi** | Bug lama yang muncul kembali; wajib memiliki tes regresi. |
| **Flaky test** | Tes yang hasilnya tidak stabil; harus diperbaiki, bukan diabaikan. |

## 8. Aturan penggunaan

- Gunakan istilah sesuai glosarium ini di dokumen, UI, dan kode.
- Jangan memakai "tenant" dan "perusahaan" untuk arti berbeda.
- Jangan memakai "post" untuk berarti metode HTTP saja.
- Istilah baru yang memengaruhi database, API, izin, atau keamanan harus ditinjau pemilik dokumen terkait.
- Singkatan yang tidak tercantum di sini ditulis lengkap pada penggunaan pertama.

## 9. Dokumen terkait

- [Produk](README.md)
- [Peta modul](peta-modul.md)
- [Matriks izin](../security/matriks-izin.md)
- [Kontrak API](../technical/backend/kontrak-api.md)
- [Registry kode error](../technical/backend/kode-error.md)
- [Spesifikasi UI](../technical/frontend/spesifikasi-ui.md)
- [Operasi](../operations/README.md)
- [QA/QC](../qaqc/README.md)
