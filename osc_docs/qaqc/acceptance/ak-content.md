# UAT Modul AK Konten dan Notifikasi

Status: Disetujui (0.6)

## 1. Cakupan

Artikel dan halaman, blog dan pengumuman, template notifikasi, riwayat kirim, dan preferensi pengguna.

## 2. Prasyarat

- Halaman publik `CP` aktif di staging.
- Stub email dan webhook untuk notifikasi.
- Akun penulis, viewer, requester, dan admin.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AK-01 | Artikel dan halaman | penulis | Buat draf; pratinjau; terbitkan; buka halaman publik; tarik publikasi | Draf tidak terlihat publik; halaman terbit dapat diakses; setelah ditarik, halaman tidak tersedia; audit mencatat publish dan unpublish | BE-F-06, FE-F-10 |
| UAT-AK-02 | Blog dan jadwal | penulis | Jadwalkan publikasi pada zona waktu tertentu | Publikasi muncul sesuai jadwal; status berubah otomatis; jadwal dapat dibatalkan; audit mencatat | BE-F-06, BE-F-09 |
| UAT-AK-03 | Template notifikasi | company_admin | Buat template dengan variabel; kirim uji; gunakan variabel tidak dikenal | Template valid tersimpan; variabel tidak dikenal ditolak `AA00-00-0001`; kirim uji berhasil; tidak ada rahasia di template | BE-F-06, FE-F-06 |
| UAT-AK-04 | Riwayat kirim | viewer | Buka riwayat; picu kegagalan webhook; lihat retry | Status dan alasan gagal terlihat; retry berjalan; payload gagal tidak memuat rahasia; tidak ada 5xx ke UI | BE-F-06, FE-F-11 |
| UAT-AK-05 | Preferensi pengguna | requester | Ubah preferensi notifikasi; picu event yang sama dua kali | Preferensi tersimpan; notifikasi mengikuti preferensi; event duplikat dideduplikasi; hanya preferensi sendiri yang berubah | BE-F-06, FE-F-11 |
| UAT-AK-06 | Sanitasi konten | penulis | Simpan artikel berisi script dan event handler | Script dan atribut berbahaya disanitasi; tidak ada eksekusi di halaman publik; CSP tetap berlaku | BE-F-06, FE-F-10 |
| UAT-AK-07 | Bahasa dan fallback | penulis | Buat konten `id`; buka dengan locale `en`; hapus kunci terjemahan | Konten dan label mengikuti locale; kunci hilang jatuh ke `en`; kode tidak berubah; tidak ada error | BE-F-12, FE-F-12 |
| UAT-AK-08 | Scope dan cache publik | viewer | Buka artikel perusahaan lain; periksa cache halaman publik | Artikel perusahaan lain `AA00-00-0004`; cache publik tidak memuat data sesi, izin, atau data perusahaan lain | BE-F-05, DB-F-02 |
| UAT-AK-09 | Audit publikasi | auditor | Terbitkan lalu tarik artikel; periksa audit | Audit memuat aktor, waktu, status lama dan baru; tidak ada data pribadi di payload | BE-F-09 |
| UAT-AK-10 | Rate limit kirim uji | company_admin | Kirim uji berulang dengan cepat | Rate limit `AA00-00-0006`; tidak ada 5xx; pengiriman sah tetap dapat dilakukan setelah jeda | BE-F-06, FE-F-13 |

## 4. Kriteria lulus

- Konten publik tidak memuat script, data sesi, atau data perusahaan lain.
- Notifikasi mengikuti preferensi dan tidak duplikat.
- Template dan riwayat tidak memuat rahasia.
- Publikasi dan penarikan konten tercatat di audit.
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

`BE-F-05`, `BE-F-06`, `BE-F-09`, `BE-F-12`, `DB-F-02`, `FE-F-06`, `FE-F-09`, `FE-F-10`, `FE-F-11`, `FE-F-12`, `FE-F-13`
