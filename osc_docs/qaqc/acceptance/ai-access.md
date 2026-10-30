# UAT Modul AI Akses Aman (Bastion)

Status: Disetujui (0.6)

## 1. Cakupan

Target akses, permintaan dan approval, sesi aktif, rekaman, serta kebijakan akses.

## 2. Prasyarat

- Stub JumpServer untuk sesi dan rekaman.
- Target SSH uji dengan akun terbatas.
- Akun `requester`, `area_manager`, `company_admin`, dan `auditor`.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AI-01 | Target dan kredensial | company_admin | Tambah target; uji koneksi; periksa detail target | Target tersimpan; kredensial hanya referensi vault; nilai rahasia tidak tampil; uji koneksi memakai akun terbatas | BE-F-10 |
| UAT-AI-02 | Permintaan akses sendiri | requester | Buat permintaan dengan alasan, mulai, dan selesai; lihat daftar permintaan | Permintaan dibuat; hanya permintaan sendiri terlihat; requester tidak dapat menyetujui atau melihat permintaan orang lain | BE-F-05, FE-F-06 |
| UAT-AI-03 | Approval dan pembatasan | area_manager | Setujui permintaan; coba di luar jam kerja; coba durasi melebihi kebijakan; coba tanpa MFA | Approval berhasil dalam kebijakan; di luar jam kerja, durasi berlebih, atau tanpa MFA ditolak dengan kode yang sesuai | BE-F-05, BE-F-07 |
| UAT-AI-04 | Sesi aktif | noc_operator | Mulai sesi setelah approval; lihat sesi aktif; cabut sesi | Sesi tercatat dengan target dan waktu; pencabutan langsung berlaku; sesi berakhir tercatat di audit | BE-F-06, BE-F-09 |
| UAT-AI-05 | Rekaman | auditor | Buka metadata rekaman; buka tautan rekaman | Hanya metadata dan tautan yang diizinkan; akses tautan dicatat; tidak ada kredensial di UI atau log | BE-F-09, FE-F-09 |
| UAT-AI-06 | Permintaan kedaluwarsa | requester | Gunakan permintaan yang sudah kedaluwarsa; ulangi dengan idempotency key sama | Kedaluwarsa `AI-02-6001`; key sama tidak membuat permintaan ganda; key bentrok `AA00-00-0007` | BE-F-08 |
| UAT-AI-07 | Kebijakan akses | company_admin | Ubah durasi dan jam kerja; simpan tanpa MFA ulang | Perubahan memerlukan `AI05:post` dan MFA; audit memuat before/after; kebijakan baru berlaku pada permintaan berikutnya | BE-F-05, BE-F-09 |
| UAT-AI-08 | Scope dan peran | noc_operator area A | Akses target area B; login sebagai viewer | Target area B `AA00-00-0004`; viewer tidak melihat menu dan API menolak `AA00-00-0003` | BE-F-05, DB-F-02 |
| UAT-AI-09 | Integrasi tidak tersedia | noc_operator | Matikan JumpServer; coba mulai sesi | Respons `AA00-00-0900`; sesi tidak dibuat; tidak ada 5xx; percobaan tercatat dan dapat diulang | BE-F-10, FE-F-13 |

## 4. Kriteria lulus

- Requester hanya dapat melihat dan membuat permintaan sendiri.
- Tidak ada sesi tanpa approval, MFA, dan kebijakan waktu.
- Kredensial target tidak pernah terekspos.
- Pencabutan sesi berlaku segera.
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

`BE-F-05`, `BE-F-06`, `BE-F-07`, `BE-F-08`, `BE-F-09`, `BE-F-10`, `DB-F-02`, `FE-F-06`, `FE-F-09`, `FE-F-13`
