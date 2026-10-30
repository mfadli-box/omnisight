# UAT Modul AC Manajemen Aset

Status: Disetujui (0.6)

## 1. Cakupan

Hierarki perusahaan, area, dan lokasi; kategori dan model; aset fisik; check-out/in; mutasi; label QR; laporan.

## 2. Prasyarat

- Dua perusahaan, dua area, dan lokasi pada masing-masing area.
- Pengguna anggota perusahaan untuk penanggung jawab aset.
- Akun `company_admin`, `area_manager`, `field_technician`, `viewer`, dan `requester`.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AC-01 | Integritas hierarki | area_manager | Buat lokasi dengan area milik perusahaan lain; simpan | Ditolak `AA00-00-0001`; foreign key komposit mencegah relasi lintas perusahaan; tidak ada data parsial | BE-F-06, DB-F-03 |
| UAT-AC-02 | Buat aset | field_technician | Buat kategori, model, dan aset; ulangi serial yang sama | Aset dibuat dengan status dan lokasi benar; serial duplikat `AA00-00-0005`; QR dapat dicetak | BE-F-06, FE-F-06 |
| UAT-AC-03 | Check-out dan check-in | field_technician | Check-out ke anggota; coba ke non-anggota; check-out dua kali; check-in dengan kondisi | Check-out berhasil; non-anggota ditolak; aset yang sedang dipinjam `AC-04-2001`; check-in mencatat kondisi dan tanggal | BE-F-06, BE-F-09 |
| UAT-AC-04 | Mutasi aset | area_manager | Pindahkan aset ke area lain; periksa riwayat; coba hapus riwayat | Mutasi berhasil dengan approval bila lintas area; riwayat bertambah dan tidak dapat dihapus; audit memuat lokasi lama dan baru | BE-F-06, BE-F-09 |
| UAT-AC-05 | Isolasi area | field_technician area A | Buka aset area A; ganti ID ke aset area B; login sebagai viewer | Aset area A berhasil; aset area B `AA00-00-0004`; viewer hanya dapat membaca | BE-F-05, DB-F-02 |
| UAT-AC-06 | Akses aset sendiri | requester | Buka `/assets/mine`; coba buka daftar aset penuh | Hanya aset yang ditugaskan; daftar penuh ditolak `AA00-00-0003`; tidak ada data aset lain | BE-F-05, FE-F-03 |
| UAT-AC-07 | Laporan dan ekspor | viewer dan area_manager | Ekspor laporan area; periksa isi dan audit | Ekspor hanya memuat scope; kolom sensitif tidak ada; ekspor tercatat di audit; viewer tidak dapat mengekspor data di luar izin | BE-F-09, FE-F-10 |
| UAT-AC-08 | QR dan pencarian | field_technician | Pindai QR aset area sendiri; pindai QR rusak atau aset luar scope | Aset ditemukan dalam scope; QR tidak valid `AA00-00-0004`; tidak ada enumerasi aset | BE-F-06, FE-F-05 |
| UAT-AC-09 | Konflik versi | dua area_manager | Ubah aset yang sama dari dua sesi | Perubahan kedua mendeteksi konflik `AA00-00-0005`; tidak ada overwrite diam-diam | BE-F-06, DB-F-04 |
| UAT-AC-10 | Error dan bahasa | field_technician | Kirim payload tidak valid; ganti bahasa | Validasi `AA00-00-0001` dengan pesan terlokalisasi; kode tetap; tidak ada 5xx | BE-F-12, FE-F-13 |

## 4. Kriteria lulus

- Tidak ada aset tanpa perusahaan, area, dan lokasi yang konsisten.
- Riwayat mutasi dan check-out tidak dapat dihapus pengguna.
- Requester tidak dapat menelusuri aset bersama.
- Ekspor aset selalu mengikuti scope dan tercatat.
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

`BE-F-05`, `BE-F-06`, `BE-F-09`, `BE-F-12`, `DB-F-02`, `DB-F-03`, `DB-F-04`, `FE-F-03`, `FE-F-05`, `FE-F-06`, `FE-F-10`, `FE-F-13`
