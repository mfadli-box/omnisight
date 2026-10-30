# UAT Modul AH Backup dan Konfigurasi

Status: Disetujui (0.6)

## 1. Cakupan

Sumber konfigurasi, jadwal backup, snapshot dan diff, restore, serta verifikasi integritas.

## 2. Prasyarat

- Perangkat stub dan endpoint Nginx untuk sumber konfigurasi.
- Object storage uji dengan enkripsi.
- Dua approver berbeda untuk skenario dual control.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AH-01 | Sumber dan jadwal | company_admin | Tambah sumber; atur cron dan zona waktu; atur retensi | Jadwal tampil sesuai zona waktu; retensi valid; duplikat sumber `AA00-00-0005`; audit mencatat perubahan | BE-F-06, BE-F-09 |
| UAT-AH-02 | Snapshot terenkripsi | admin dan agent | Jalankan backup; unduh objek dari storage; periksa checksum | Snapshot terenkripsi dan memiliki checksum; objek tidak dapat diubah; metadata benar | AG-F-07, DB-F-05 |
| UAT-AH-03 | Diff dan unduh | area_manager | Buka diff dua snapshot; unduh snapshot terenkripsi | Diff hanya menampilkan scope; unduhan memerlukan izin, dicatat, dan tidak menyajikan plaintext | BE-F-05, BE-F-09, FE-F-10 |
| UAT-AH-04 | Restore dual control | company_admin A dan B | Ajukan restore dengan alasan; setujui dengan akun berbeda; eksekusi; verifikasi | Tanpa approval `AH-04-5001`; self-approval ditolak; setelah dua approver berbeda berhasil; audit memuat alasan dan hasil | BE-F-07, BE-F-08, FE-F-07 |
| UAT-AH-05 | Restore tidak sah | company_admin | Setujui permintaan sendiri; pakai approval kedaluwarsa; pilih target area lain | Semua ditolak dengan kode yang sesuai; tidak ada data yang berubah; percobaan tercatat | BE-F-05, BE-F-07 |
| UAT-AH-06 | Verifikasi restore | company_admin | Jalankan verifikasi di lingkungan terisolasi | Restore verifikasi berhasil; hasil dan waktu dicatat; produksi tidak tersentuh | BE-F-07, DB-F-10 |
| UAT-AH-07 | Kegagalan agent | agent | Matikan agent saat backup; sambungkan kembali | Retry terbatas; alert dibuat; tidak ada snapshot parsial yang dianggap valid; buffer tidak memuat konfigurasi sensitif | AG-F-07, AG-F-09 |
| UAT-AH-08 | Isolasi dan peran | viewer | Buka snapshot area lain; coba unduh | Area lain `AA00-00-0004`; viewer tidak dapat mengunduh atau restore; API menolak `AA00-00-0003` | BE-F-05, DB-F-02 |
| UAT-AH-09 | Error dan bahasa | company_admin | Jalankan backup tanpa sumber valid; ganti bahasa | Validasi `AA00-00-0001` terlokalisasi; tidak ada 5xx; kode tetap | BE-F-12, FE-F-13 |

## 4. Kriteria lulus

- Snapshot tidak dapat diubah dan selalu memiliki checksum.
- Restore selalu memerlukan dua pengguna berbeda dan audit.
- Tidak ada konfigurasi sensitif yang tersimpan tanpa enkripsi.
- Kegagalan backup tidak menghasilkan snapshot parsial yang valid.
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

`AG-F-07`, `AG-F-09`, `BE-F-05`, `BE-F-06`, `BE-F-07`, `BE-F-08`, `BE-F-09`, `BE-F-12`, `DB-F-02`, `DB-F-05`, `DB-F-10`, `FE-F-07`, `FE-F-10`, `FE-F-13`
