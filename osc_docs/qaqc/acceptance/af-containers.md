# UAT Modul AF Operasi Container

Status: Disetujui (0.6)

## 1. Cakupan

Endpoint Docker/Podman, stack dan compose, deploy dan rollback, maintenance, serta gambaran host.

## 2. Prasyarat

- Host uji dengan Docker atau Podman dan socket proxy allowlist.
- Registry stub dengan image bertag dan image tanpa digest.
- Akun `noc_operator`, `area_manager`, `company_admin`, dan approver terpisah.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AF-01 | Endpoint dan socket proxy | company_admin | Daftarkan endpoint; akses endpoint di luar allowlist; periksa TLS | Endpoint aktif dengan TLS; endpoint di luar allowlist ditolak; socket mentah tidak dapat diakses dari aplikasi | BE-F-10 |
| UAT-AF-02 | Validasi compose | noc_operator | Simpan compose valid; simpan image tanpa digest; hapus resource limit pada produksi | Compose valid diterima; image tanpa digest `AF-04-4001`; resource limit wajib untuk produksi | BE-F-06, AG-F-06 |
| UAT-AF-03 | Deploy dengan approval | noc_operator dan approver | Buat plan; lihat diff; minta approval; deploy; cek health | Tanpa approval ditolak; setelah approval dan MFA deploy berjalan; health check lulus; audit memuat revision | BE-F-07, BE-F-08, FE-F-07 |
| UAT-AF-04 | Health check gagal | noc_operator | Deploy image yang sengaja gagal health check | Rollback otomatis ke revision sebelumnya; kode `AF-04-4002`; layanan kembali sehat; audit memuat kedua revision | BE-F-07, AG-F-06 |
| UAT-AF-05 | Maintenance terkontrol | noc_operator | Restart layanan; buka log; coba akses shell container | Restart sesuai kebijakan approval; log tidak memuat rahasia; akses shell ditolak; tidak ada `exec` bebas | BE-F-10, AG-F-06 |
| UAT-AF-06 | Metrik container | viewer | Buka metrik container; hentikan agent sementara | Metrik dan status tampil; saat agent offline, status terakhir dan waktu terakhir terlihat; tidak ada data palsu | AG-F-04, FE-F-08 |
| UAT-AF-07 | Allowlist tugas agent | agent | Kirim tugas di luar allowlist; kirim tugas kedaluwarsa; ulangi idempotency key | Tugas luar allowlist dan kedaluwarsa ditolak; key sama tidak dieksekusi dua kali; key bentrok `AA00-00-0007` | AG-F-05, AG-F-06, BE-F-08 |
| UAT-AF-08 | Scope deploy | noc_operator area A | Deploy stack area A; coba stack area B; login sebagai viewer | Area A berhasil; area B `AA00-00-0004`; viewer tidak melihat tombol deploy dan API menolak `AA00-00-0003` | BE-F-05, DB-F-02 |
| UAT-AF-09 | Deploy bersamaan | dua noc_operator | Deploy stack yang sama pada waktu bersamaan | Satu deploy berjalan; yang lain mendapat konflik `AA00-00-0005`; tidak ada double execution | BE-F-08, DB-F-04 |
| UAT-AF-10 | Error dan bahasa | noc_operator | Kirim compose tidak valid; ganti bahasa | Validasi `AA00-00-0001` terlokalisasi; kode tetap; tidak ada 5xx | BE-F-12, FE-F-13 |

## 4. Kriteria lulus

- Tidak ada deploy produksi tanpa approval, digest, dan health check.
- Tidak ada akses socket mentah atau shell bebas.
- Rollback berhasil dan tercatat saat health check gagal.
- Semua aksi container terikat area dan audit.
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

`AG-F-04`, `AG-F-05`, `AG-F-06`, `BE-F-05`, `BE-F-06`, `BE-F-07`, `BE-F-08`, `BE-F-10`, `BE-F-12`, `DB-F-02`, `DB-F-04`, `FE-F-07`, `FE-F-08`, `FE-F-13`
