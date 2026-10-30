# UAT Modul AG Edge, Domain, dan Sertifikat

Status: Disetujui (0.6)

## 1. Cakupan

Domain, sertifikat, proxy host, konfigurasi Nginx, dan edge node.

## 2. Prasyarat

- Domain uji dan sertifikat yang dapat diperbarui.
- Edge agent pada host uji dengan file config terkelola.
- Akun `company_admin`, `area_manager`, `viewer`, dan approver terpisah.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AG-01 | Domain dan sertifikat | company_admin | Daftarkan domain dan sertifikat; atur pengingat kedaluwarsa | Data tersimpan; expiry dihitung; alert muncul pada ambang yang ditentukan; audit mencatat perubahan | BE-F-06, BE-F-09 |
| UAT-AG-02 | Private key tidak terekspos | company_admin | Unggah sertifikat; buka detail; periksa API dan log | Private key hanya referensi vault; tidak pernah dikembalikan API, UI, atau log; fingerprint terlihat | BE-F-10, FE-F-10 |
| UAT-AG-03 | Validasi proxy host | area_manager | Buat proxy host valid; kirim upstream tidak valid; kirim header berbahaya | Proxy valid diterima; upstream tidak valid ditolak; header berbahaya ditolak; tidak ada konfigurasi mentah bebas | BE-F-06, BE-F-10 |
| UAT-AG-04 | Apply konfigurasi Nginx | area_manager dan approver | Ajukan perubahan; setujui; apply; simulasikan `nginx -t` gagal | Tanpa approval ditolak; config valid di-reload atomik; config gagal tidak mengganti file lama; rollback tersedia | BE-F-07, AG-F-08, FE-F-07 |
| UAT-AG-05 | Edge agent offline | company_admin | Matikan edge agent; ajukan apply konfigurasi | Apply tidak dijalankan; status offline terlihat; alert dibuat; tidak ada file setengah tertulis | AG-F-05, AG-F-08 |
| UAT-AG-06 | Rotasi dan pencabutan | company_admin | Rotasi sertifikat agent; cabut agent; coba apply | Rotasi berhasil; agent tercabut tidak dapat poll atau apply; kejadian tercatat | AG-F-06, AG-F-10 |
| UAT-AG-07 | Isolasi perusahaan | area_manager perusahaan A | Ganti ID edge node ke perusahaan B | Ditolak `AA00-00-0004`; tidak ada konfigurasi atau domain perusahaan lain yang terlihat | BE-F-05, DB-F-02 |
| UAT-AG-08 | Audit dan bahasa | auditor | Periksa audit apply dan rollback; ganti bahasa | Audit memuat checksum sebelum/sesudah; pesan terlokalisasi; kode tetap | BE-F-09, BE-F-12 |

## 4. Kriteria lulus

- Tidak ada konfigurasi Nginx yang diterapkan tanpa validasi dan audit.
- Private key dan rahasia sertifikat tidak pernah terekspos.
- Agent edge yang dicabut tidak dapat menerima tugas.
- Perubahan config memiliki jejak checksum dan rollback.
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

`AG-F-05`, `AG-F-06`, `AG-F-08`, `AG-F-10`, `BE-F-05`, `BE-F-06`, `BE-F-07`, `BE-F-09`, `BE-F-10`, `BE-F-12`, `DB-F-02`, `FE-F-07`, `FE-F-10`
