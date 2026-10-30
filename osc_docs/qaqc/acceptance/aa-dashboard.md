# UAT Modul AA Dashboard

Status: Disetujui (0.6)

## 1. Cakupan

Agregasi dashboard, status komponen, aktivitas terbaru, dan tugas pribadi. Dashboard tidak menambah akses; semua angka mengikuti scope pengguna.

## 2. Prasyarat

- Dua perusahaan dengan dua area dan satu area anak.
- Data aset, host, alert, tiket, deploy, dan sertifikat pada kedua area.
- Akun `company_admin`, `viewer`, `noc_operator`, `platform_support`, dan `requester`.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AA-01 | Ringkasan mengikuti scope | company_admin area A | Buka dashboard area A; catat kartu; ganti ke area B; bandingkan dengan query database | Angka area A tidak memuat data area B; setelah ganti area, query dan angka berubah; tidak ada data area saudara | BE-F-04, BE-F-05, FE-F-02, FE-F-08 |
| UAT-AA-02 | Dashboard tanpa data | viewer area baru | Buka dashboard area kosong; ganti bahasa lalu muat ulang | Kartu menampilkan 0 atau empty state; tidak ada error; label mengikuti locale; tidak ada 5xx | FE-F-08, FE-F-12, FE-F-13 |
| UAT-AA-03 | Aktivitas tidak bocor | viewer | Buka aktivitas terbaru; periksa field; coba tautan audit penuh | Hanya aktivitas yang diizinkan; payload sensitif disamarkan; audit penuh ditolak `AA00-00-0003` | BE-F-05, BE-F-09, FE-F-09 |
| UAT-AA-04 | Tugas saya | company_admin | Buka daftar tugas; bandingkan dengan approval milik pengguna lain | Hanya approval dan tugas milik pengguna; tidak ada tugas pengguna lain; tautan approval mengarah ke modul terkait | BE-F-07, FE-F-03 |
| UAT-AA-05 | Kesehatan layanan terbatas | platform_support dan viewer | Buka halaman kesehatan komponen | Platform melihat komponen internal; viewer tidak melihat detail; tidak ada hostname, IP, atau URL internal | BE-F-14, FE-F-03 |
| UAT-AA-06 | Kegagalan API | viewer | Simulasikan respons `AA00-00-0900`; muat ulang | Banner pemulihan, `request_id`, tombol coba lagi; HTTP 200 envelope; tidak ada 5xx | FE-F-13 |
| UAT-AA-07 | Bahasa dan zona waktu | company_admin | Ganti `en` ke `id`; periksa tanggal dan angka | Label berubah; kode tidak berubah; tanggal mengikuti zona waktu perusahaan; preferensi tersimpan | BE-F-12, FE-F-12 |
| UAT-AA-08 | Requester | requester | Buka dashboard; panggil endpoint modul lain langsung | Hanya ringkasan self; menu lain tersembunyi; endpoint lain membalas `AA00-00-0003` dan tercatat | BE-F-05, FE-F-03 |

## 4. Kriteria lulus

- Angka dashboard dapat direkonsiliasi dengan data pada scope yang sama.
- Tidak ada field sensitif atau tautan lintas scope pada kartu dan aktivitas.
- Dashboard tetap dapat dipakai saat satu integrasi gagal.
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

`BE-F-04`, `BE-F-05`, `BE-F-09`, `BE-F-12`, `BE-F-14`, `FE-F-02`, `FE-F-03`, `FE-F-08`, `FE-F-09`, `FE-F-12`, `FE-F-13`
