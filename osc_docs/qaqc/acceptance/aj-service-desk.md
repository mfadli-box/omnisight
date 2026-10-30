# UAT Modul AJ Layanan dan Kontrak

Status: Disetujui (0.6)

## 1. Cakupan

Tiket, kategori dan SLA, kontrak dan vendor, knowledge base, laporan layanan, serta sinkronisasi GLPI opsional.

## 2. Prasyarat

- Kategori dan kalender layanan uji.
- Akun `requester`, `field_technician`, `area_manager`, `viewer`, dan `auditor`.
- Stub GLPI untuk skenario sinkronisasi.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AJ-01 | Buat tiket | requester | Buat tiket dengan kategori dan prioritas; periksa SLA | Tiket dibuat; SLA mulai sesuai kalender; requester hanya melihat tiket sendiri; notifikasi terkirim | BE-F-06, FE-F-06, FE-F-11 |
| UAT-AJ-02 | Scope tiket | field_technician area A | Buka tiket area A; ganti ID ke tiket area B | Tiket area A terlihat; tiket area B `AA00-00-0004`; tidak ada komentar atau lampiran yang bocor | BE-F-05, DB-F-02 |
| UAT-AJ-03 | Assign dan komentar | area_manager | Assign tiket; tambah komentar internal dan publik; ubah status | Assign hanya ke anggota; komentar internal tidak terlihat requester; perubahan status dan komentar tercatat | BE-F-06, BE-F-09 |
| UAT-AJ-04 | SLA breach | noc_operator | Biarkan tiket melewati ambang SLA | Alert SLA dibuat; status terlihat; kebijakan pause dan resume berjalan; tidak ada duplikasi alert | BE-F-06, BE-F-09 |
| UAT-AJ-05 | Kategori dan SLA | company_admin | Ubah kalender layanan; simpan konfigurasi tidak valid | Konfigurasi valid tersimpan; konfigurasi tidak valid `AA00-00-0001`; tiket berjalan tidak kehilangan SLA secara diam-diam | BE-F-06 |
| UAT-AJ-06 | Kontrak dan vendor | company_admin | Unggah dokumen kontrak; coba tipe file terlarang; unduh sebagai viewer | Unggahan valid tersimpan; tipe terlarang ditolak; viewer tidak dapat mengunduh; unduhan tercatat | BE-F-06, FE-F-10 |
| UAT-AJ-07 | Knowledge base | area_manager | Buat artikel draf; terbitkan; buka sebagai requester | Draf tidak terlihat publik; artikel terbit terlihat sesuai visibilitas; HTML disanitasi | BE-F-06, FE-F-10 |
| UAT-AJ-08 | Laporan layanan | auditor | Buka laporan volume dan SLA; ekspor | Angka sesuai scope; ekspor memerlukan izin dan tercatat; tidak ada data pribadi berlebih | BE-F-05, BE-F-09 |
| UAT-AJ-09 | Sinkronisasi GLPI | company_admin | Jalankan sync dua kali; ubah tiket di kedua sisi | Sync idempotent; konflik terdeteksi dan tidak menimpa diam-diam; kegagalan tidak menghilangkan tiket lokal | BE-F-08, BE-F-10 |
| UAT-AJ-10 | Notifikasi dan bahasa | requester | Picu notifikasi; ganti bahasa | Notifikasi memakai template `en` atau `id`; variabel terisi; kode tidak berubah; tidak ada rahasia di isi notifikasi | BE-F-12, FE-F-11, FE-F-12 |

## 4. Kriteria lulus

- Requester hanya melihat tiket dan lampiran miliknya.
- Komentar internal tidak pernah terlihat requester.
- SLA dan perubahan status tercatat dan dapat diaudit.
- Sinkronisasi GLPI tidak menyebabkan kehilangan data.
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

`BE-F-05`, `BE-F-06`, `BE-F-08`, `BE-F-09`, `BE-F-10`, `BE-F-12`, `DB-F-02`, `FE-F-06`, `FE-F-10`, `FE-F-11`, `FE-F-12`
