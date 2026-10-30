# UAT Modul AB Identitas, Organisasi, dan Akses

Status: Disetujui (0.6)

## 1. Cakupan

Login lokal dan HRIS, MFA, sesi, membership multi-perusahaan, area, role, undangan, dan audit login.

## 2. Prasyarat

- HRIS stub dengan mode POST dan GET, aturan sukses/gagal, dan timeout.
- Akun admin dengan MFA dan akun pengguna tanpa MFA.
- Dua perusahaan dan satu pengguna yang menjadi anggota keduanya.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AB-01 | Login lokal sukses | pengguna aktif | Login dengan kredensial benar; periksa cookie dan storage | Masuk portal; cookie `HttpOnly`, `Secure`, `SameSite=Lax`; tidak ada token di `localStorage` atau `sessionStorage`; locale default `en` | BE-F-01, BE-F-03, FE-F-01 |
| UAT-AB-02 | Login gagal generik | pengguna aktif | Salah password beberapa kali; cek pesan dan audit | Pesan sama untuk akun tidak ada dan password salah; lockout bertahap; `core.login_attempts` terisi; tidak ada password di log | BE-F-01, BE-F-09 |
| UAT-AB-03 | Login HRIS POST dan GET | pengguna HRIS | Login mode POST sukses; ulangi mode GET; simulasikan gagal dan timeout | Mapping role dan pesan gagal berjalan; timeout memakai fallback kebijakan; respons HRIS mentah tidak dicatat; kode `AB-04-1001` atau `AB-04-1002` sesuai kasus | BE-F-02, BE-F-10, FE-F-01 |
| UAT-AB-04 | MFA dan aksi sensitif | company_admin | Enroll MFA; buka aksi sensitif tanpa MFA ulang; verifikasi lalu ulangi | Enroll berhasil; aksi sensitif meminta MFA ulang; setelah verifikasi berhasil; kegagalan tidak membocorkan detail | BE-F-03, BE-F-05, FE-F-01 |
| UAT-AB-05 | Ganti perusahaan dan area | anggota dua perusahaan | Ganti perusahaan lalu area; periksa query dan scope | Scope dan izin berubah; query lama tidak menampilkan data perusahaan sebelumnya; membership tidak aktif ditolak `AB-02-1003` | BE-F-04, FE-F-02 |
| UAT-AB-06 | Undang dan nonaktifkan pengguna | company_admin | Undang email baru; ulangi email sama; nonaktifkan pengguna yang sedang login | Undangan dibuat; duplikat `AA00-00-0005`; setelah nonaktif, sesi pengguna langsung dicabut | BE-F-03, BE-F-06, FE-F-06 |
| UAT-AB-07 | Perubahan role | company_admin | Cabut izin modul dari role; lanjutkan request pengguna; coba hapus admin terakhir; coba menaikkan role sendiri | Izin berlaku pada request berikutnya; admin terakhir tidak dapat dihapus; self-escalation ditolak `AA00-00-0003`; audit memuat before/after | BE-F-05, BE-F-09, FE-F-03 |
| UAT-AB-08 | Sesi dan refresh | company_admin dan pengguna | Admin mencabut sesi pengguna lain; pengguna memakai refresh token lama | Sesi tercabut; reuse refresh mencabut seluruh family; pengguna hanya dapat melihat dan mencabut sesi sendiri lewat self-service | BE-F-03, FE-F-02 |
| UAT-AB-09 | Konfigurasi HRIS | company_admin | Ubah `base_url` ke host tidak diizinkan; uji koneksi; simpan konfigurasi | URL tidak diizinkan ditolak; SSRF dicegah; kredensial tidak pernah dikembalikan; perubahan memerlukan `AB04:post`, MFA, dan approval | BE-F-02, BE-F-10 |
| UAT-AB-10 | Audit dan bahasa | auditor | Periksa login sukses, gagal, dan penolakan akses; ganti locale pengguna | Semua kejadian tercatat; identifier disamarkan; locale tersimpan dan dipakai pada respons berikutnya; kode tidak berubah | BE-F-09, BE-F-12, FE-F-12 |

## 4. Kriteria lulus

- Tidak ada pesan yang membedakan akun tidak ada dan password salah.
- Semua perubahan role, membership, dan status pengguna tercatat di audit.
- Sesi pengguna nonaktif atau dicabut tidak dapat dipakai lagi.
- Konfigurasi HRIS tidak pernah menampilkan rahasia.
- Seluruh skenario global yang relevan berstatus `Lulus`.
- Tidak ada temuan S1 atau S2; temuan S3 ditutup atau disetujui risikonya.
- Bukti tersimpan dan audit event dapat ditemukan dari `request_id`.

## 5. Bukti yang dikumpulkan

- Screenshot atau rekaman layar untuk alur utama dan penolakan.
- `request_id` dan ID audit untuk setiap aksi tulis.
- Kutipan respons envelope untuk kasus negatif.
- Hasil ekspor atau unduhan yang diuji, bila ada.
- Catatan versi build, migrasi, dan katalog bahasa.

## 6. Rujukan fungsi

`BE-F-01`, `BE-F-02`, `BE-F-03`, `BE-F-04`, `BE-F-05`, `BE-F-06`, `BE-F-09`, `BE-F-10`, `FE-F-01`, `FE-F-02`, `FE-F-03`, `FE-F-06`, `FE-F-12`
