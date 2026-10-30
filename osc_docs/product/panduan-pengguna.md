# Panduan Pengguna dan Admin

Status: Disetujui (0.6)

Panduan ini menjelaskan cara memakai OmniSight sehari-hari. Bahasa Inggris adalah default; pilih Indonesia dari header atau halaman preferensi. Kode error dan kode modul tetap sama dalam bahasa apa pun.

## 1. Masuk ke OmniSight

### Login lokal

1. Buka halaman `/login`.
2. Masukkan email dan password.
3. Jika MFA aktif, masukkan kode dari aplikasi authenticator.
4. Jika Anda anggota lebih dari satu perusahaan, pilih perusahaan aktif.
5. Pilih area aktif bila tersedia lebih dari satu.

Pesan gagal login bersifat umum. OmniSight tidak memberi tahu apakah email tidak terdaftar atau password salah.

### Login HRIS

1. Buka `/login/hris`.
2. Pilih perusahaan.
3. Masukkan kredensial HRIS.
4. Jika HRIS menolak, ikuti pesan yang tampil. Aturan sukses/gagal ditentukan admin perusahaan.
5. Jika HRIS tidak tersedia, hubungi admin; jangan mencoba berulang tanpa jeda.

### Ganti bahasa

- Klik pemilih bahasa di header atau buka `/profile/preferences`.
- Pilihan tersimpan pada akun dan berlaku di perangkat lain.
- Perubahan bahasa tidak mengubah izin, data, atau rute.

## 2. Peran dan fokus kerja

| Peran | Fokus harian |
|---|---|
| Platform Owner | Onboarding perusahaan, integrasi, audit platform, dukungan |
| Company Admin | Pengguna, area, peran, aset, layanan perusahaan |
| Area Manager | Aset, perangkat, tiket, dan approval di area |
| NOC Operator | Monitoring, alert, insiden, deploy dengan approval |
| Field Technician | Aset, check-out/in, tiket lapangan |
| Viewer | Melihat data sesuai scope |
| Auditor | Audit trail, login, review akses, ekspor |
| Requester | Tiket, permintaan akses, artikel untuk diri sendiri |

Daftar izin lengkap ada di [matriks izin](../security/matriks-izin.md). Menu yang tidak Anda lihat berarti Anda tidak memiliki izin atau scope-nya.

## 3. Layar utama

- **Dashboard**: kartu aset, host, alert, tiket, deploy, dan sertifikat sesuai scope. Dashboard tidak menambah akses.
- **Header**: perusahaan aktif, area aktif, pencarian, notifikasi, bahasa, profil.
- **Tugas saya**: approval, tiket, dan permintaan yang menunggu tindakan Anda.
- **Aktivitas terbaru**: ringkasan audit yang boleh Anda lihat.
- **Pencarian global**: hanya mencari data dalam scope Anda.

## 4. Tugas umum

### Melihat dan memakai aset

1. Buka **Aset → Aset Fisik**.
2. Cari berdasarkan nama, tag, serial, atau pindai QR.
3. Buka detail untuk melihat lokasi, penanggung jawab, garansi, dan riwayat.
4. Untuk check-out, pilih anggota perusahaan yang menerima aset dan isi kondisi.
5. Untuk check-in, isi kondisi dan tanggal kembali.
6. Jika aset hilang atau rusak, buat tiket dan jangan mengubah status sendiri tanpa izin.

Anda tidak dapat menghapus riwayat mutasi atau check-out.

### Memantau alert

1. Buka **Monitoring → Alert dan Ambang**.
2. Baca rule, target, dan kondisi aktual.
3. Ambil alert dengan tombol acknowledge agar tim lain tahu sudah ditangani.
4. Untuk gangguan nyata, buat atau tautkan insiden dan catat tindakan.
5. Jangan men-silence alert tanpa alasan dan batas waktu.

### Menangani deploy container

1. Buka **Container → Deploy dan Rollback**.
2. Periksa plan: image digest, resource limit, perubahan, dan risiko.
3. Ajukan deploy; tunggu approval bila lingkungan produksi.
4. Setelah deploy, periksa health check dan log.
5. Jika gagal, gunakan rollback ke revisi sebelumnya dan catat penyebab.

### Mengajukan perubahan firewall

1. Buka **Jaringan → Firewall dan Aturan**.
2. Pilih perangkat dan buat rencana perubahan.
3. Periksa diff dan isi alasan.
4. Tunggu persetujuan; tombol eksekusi nonaktif sampai disetujui.
5. Setelah eksekusi, verifikasi koneksi manajemen. Rollback otomatis berjalan bila koneksi hilang.

### Restore backup konfigurasi

1. Buka **Backup → Restore**.
2. Pilih snapshot dan target.
3. Baca dampak dan snapshot pengaman yang akan dibuat.
4. Ajukan restore dan tunggu approval; restore beberapa perangkat memerlukan dual control.
5. Setelah restore, verifikasi konfigurasi dan catat hasilnya.

### Meminta akses aman

1. Buka **Akses Aman → Permintaan Akses**.
2. Pilih target, waktu mulai, waktu selesai, dan alasan.
3. Kirim permintaan.
4. Anda tidak dapat menyetujui permintaan sendiri.
5. Sesi akses mengikuti kebijakan MFA, durasi, dan jam kerja.

### Membuat tiket layanan

1. Buka **Layanan → Tiket**.
2. Pilih kategori dan prioritas.
3. Jelaskan masalah tanpa menulis password, token, atau data rahasia.
4. Pantau komentar dan SLA.
5. Tutup tiket setelah masalah selesai atau konfirmasi dari teknisi.

### Meninjau audit dan review akses

1. Buka **Audit → Audit Trail**.
2. Filter berdasarkan aktor, waktu, modul, atau `request_id`.
3. Buka detail untuk melihat sebelum/sesudah; nilai sensitif diredaksi.
4. Untuk review akses, putuskan setiap pengguna dan catat alasan.
5. Ekspor memerlukan alasan dan izin khusus.

### Mengelola perusahaan dan pengguna (admin)

1. Buka **Identitas → Perusahaan dan Area** untuk membuat area dan lokasi.
2. Buka **Pengguna dan Undangan** untuk mengundang anggota dan mengatur membership.
3. Buka **Peran dan Izin** untuk memberikan peran dengan scope area.
4. Perubahan peran memerlukan alasan dan dicatat di audit.
5. Nonaktifkan pengguna yang keluar; jangan menghapus riwayat.

### Onboarding platform (Platform Owner)

1. Buat perusahaan dan admin pertama melalui prosedur bootstrap aman.
2. Konfigurasikan integrasi dan kredensial di **Pengaturan Platform**.
3. Daftarkan agent dan verifikasi heartbeat.
4. Uji isolasi dua perusahaan sebelum onboarding klien berikutnya.
5. Gunakan impersonasi hanya untuk dukungan, dengan alasan, MFA, dan batas waktu.

## 5. Alur persetujuan

- Permintaan sensitif harus disetujui pengguna lain.
- Approver melihat dampak, risiko, diff, dan alasan sebelum memutuskan.
- Persetujuan berlaku maksimal 24 jam; setelah itu permintaan harus diajukan ulang.
- Aksi tertentu memerlukan MFA ulang dan dual control.
- Penolakan harus disertai alasan.
- Setelah keputusan, hasil dan tautan audit muncul di notifikasi.

Jika Anda merasa permintaan mendesak, hubungi approver lewat kanal resmi. Jangan meminta approver memakai akun Anda.

## 6. Profil dan keamanan akun

- **Profil**: nama, kontak, bahasa, dan preferensi.
- **Keamanan akun**: daftar sesi dan perangkat, cabut sesi lain, kelola MFA.
- **Notifikasi**: pilih kanal dan jenis notifikasi.
- **Sesi berakhir otomatis** setelah menganggur; simpan pekerjaan sebelum meninggalkan perangkat.
- **MFA** wajib untuk peran platform dan sangat disarankan untuk admin perusahaan.
- Jangan berbagi akun. Setiap aksi tercatat atas nama akun yang dipakai.

## 7. Jika ada masalah

| Yang terlihat | Arti | Tindakan |
|---|---|---|
| Halaman akses ditolak | Anda tidak punya izin atau scope | Minta akses ke admin; jangan mencoba URL lain |
| Data tidak ditemukan | Data tidak ada atau di luar scope | Periksa perusahaan/area aktif |
| Konflik versi | Data sudah diubah pengguna lain | Muat ulang, bandingkan, lalu simpan lagi |
| Terlalu banyak permintaan | Rate limit | Tunggu sesuai hitungan, lalu coba lagi |
| Layanan terganggu | Komponen pendukung tidak tersedia | Coba lagi; hubungi admin dengan `request_id` |
| Error internal | Kegagalan tak terduga | Salin `request_id` dan hubungi admin |

Aturan:

- Selalu sertakan `request_id` saat melapor.
- Jangan mengirim screenshot yang memuat data sensitif tanpa izin.
- Jangan mencoba menebak ID atau mengakses data perusahaan lain.
- Laporkan aktivitas mencurigakan ke tim keamanan.

## 8. Aturan aman

- Jangan menulis password, token, kunci API, atau data pribadi di tiket atau komentar.
- Jangan memakai akun bersama.
- Kunci perangkat saat meninggalkan meja.
- Cabut sesi pada perangkat yang hilang.
- Jangan memasang agent dari sumber tidak resmi.
- Jangan menonaktifkan MFA untuk menghindari langkah tambahan.
- Laporkan email atau tautan mencurigakan yang mengaku OmniSight.

## 9. Glosarium

Daftar istilah lengkap ada di [glosarium](glosarium.md).

| Istilah | Arti |
|---|---|
| Scope | Batas data: perusahaan, area, atau diri sendiri |
| Read/Post | Izin baca dan izin aksi tulis |
| Approval | Persetujuan pengguna lain untuk aksi sensitif |
| Dual control | Dua approver berbeda untuk satu aksi |
| Impersonasi | Sesi dukungan platform dengan banner dan batas waktu |
| Snapshot | Salinan konfigurasi pada waktu tertentu |
| Fingerprint alert | Identitas unik alert agar tidak duplikat |
| Request ID | Nomor unik untuk menelusuri satu request di log dan audit |

## 10. Dokumen terkait

- [Peta modul](../product/peta-modul.md)
- [Matriks izin](../security/matriks-izin.md)
- [Spesifikasi UI](../technical/frontend/spesifikasi-ui.md)
- [Peta menu](../technical/frontend/peta-menu.md)
- [UAT global](../qaqc/acceptance/README.md)
- [Keamanan](../security/README.md)
- [Operasi](../operations/README.md)
