# UAT Modul AL Audit dan Keamanan

Status: Disetujui (0.6)

## 1. Cakupan

Audit trail, login dan akses, kejadian keamanan, review akses, serta ekspor dan retensi.

## 2. Prasyarat

- Audit event dari beberapa modul dan dua perusahaan.
- Stub Wazuh untuk kejadian keamanan.
- Akun `auditor`, `company_admin`, `platform_security`, dan `viewer`.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AL-01 | Filter audit trail | auditor | Filter berdasarkan aktor, aksi, modul, dan tanggal | Hasil sesuai filter dan scope; before/after diredaksi; tidak ada rahasia atau data pribadi berlebih | BE-F-09, FE-F-09 |
| UAT-AL-02 | Login dan penolakan | auditor | Picu login gagal dan akses ditolak; periksa audit dan metrik | Keduanya tercatat; kode `AA00-00-0003` untuk penolakan; identifier disamarkan; metrik bertambah | BE-F-09 |
| UAT-AL-03 | Hash chain | auditor | Verifikasi rantai audit; ubah baris audit langsung di database uji | Rantai valid sebelum perubahan; perubahan terdeteksi; aplikasi tidak dapat mengubah audit; alert muncul | DB-F-05 |
| UAT-AL-04 | Auditor read-only | auditor | Coba ubah atau hapus audit; coba tulis data bisnis | Semua ditolak `AA00-00-0003`; tidak ada data berubah; percobaan tercatat | BE-F-05 |
| UAT-AL-05 | Kejadian keamanan | company_admin | Triase kejadian Wazuh; ubah status; tautkan ke insiden | Status dan tautan tersimpan; audit memuat aktor; data Wazuh tidak membocorkan rahasia | BE-F-06, BE-F-10 |
| UAT-AL-06 | Review akses | auditor | Buat kampanye review; coba review akses sendiri | Review sendiri ditolak; keputusan reviewer tercatat; kampanye dapat ditutup dengan ringkasan | BE-F-07, BE-F-09 |
| UAT-AL-07 | Ekspor audit | auditor dan approver | Ekspor audit tanpa approval; ulangi dengan approval dan MFA | Tanpa approval ditolak; setelah approval berhasil; ekspor diberi watermark dan dicatat; self-approval ditolak | BE-F-07, BE-F-09, FE-F-10 |
| UAT-AL-08 | Retensi | platform_security | Jalankan kebijakan retensi pada data uji | Data melewati retensi dihapus sesuai kebijakan; hash chain tetap valid; penghapusan tercatat | DB-F-07 |
| UAT-AL-09 | Isolasi dan peran | viewer | Buka audit perusahaan lain; login sebagai viewer | Audit perusahaan lain `AA00-00-0004`; viewer tidak melihat menu audit dan API menolak | BE-F-05, DB-F-02 |
| UAT-AL-10 | Bahasa dan error | auditor | Buka audit dengan filter tidak valid; ganti bahasa | Validasi `AA00-00-0001` terlokalisasi; kode tetap; tidak ada 5xx | BE-F-12, FE-F-13 |

## 4. Kriteria lulus

- Audit tidak dapat diubah atau dihapus melalui aplikasi.
- Setiap penolakan akses tercatat dan dihitung.
- Ekspor audit memerlukan approval dan menghasilkan jejak audit baru.
- Review akses tidak dapat dilakukan untuk diri sendiri.
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

`BE-F-05`, `BE-F-06`, `BE-F-07`, `BE-F-09`, `BE-F-10`, `BE-F-12`, `DB-F-02`, `DB-F-05`, `DB-F-07`, `FE-F-09`, `FE-F-10`, `FE-F-13`
