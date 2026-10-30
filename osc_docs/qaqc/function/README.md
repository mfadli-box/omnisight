# Dokumen Fungsi OmniSight

Status: Disetujui (0.6)

Dokumen ini mendaftarkan fungsi setiap peran komponen: agent, database, backend, dan frontend. Fungsinya menjadi acuan use case, batas tanggung jawab, dan pembagian kerja saat implementasi.

## 1. Prinsip

- Satu fungsi memiliki satu pemilik dan satu tanggung jawab utama.
- Setiap fungsi dipetakan ke modul `AA` sampai `AM`.
- Komponen tidak boleh mengambil alih fungsi komponen lain.
- Fungsi yang mengubah data harus memiliki audit dan otorisasi.
- Fungsi berisiko memerlukan approval, idempotency, dan rollback.

## 2. Struktur

| Peran | Dokumen | Isi |
|---|---|---|
| Agent | [agent/README.md](agent/README.md) | Koleksi metrik, tugas terbatas, backup, update |
| Database | [database/README.md](database/README.md) | Integritas, RLS, audit, partisi, seed |
| Backend | [backend/README.md](backend/README.md) | Autentikasi, otorisasi, use case, adapter, API |
| Frontend | [frontend/README.md](frontend/README.md) | Login, menu, form, approval, dashboard, i18n |

## 3. Batas tanggung jawab

| Peran | Boleh | Tidak boleh |
|---|---|---|
| Agent | Membaca metrik host, menjalankan tugas allowlist, mengirim data keluar | Akses database, shell bebas, membuka port masuk |
| Database | Menyimpan data, menegakkan constraint/RLS, audit, partisi | Memanggil API eksternal, menyimpan rahasia mentah tanpa kontrol |
| Backend | Menulis data domain, otorisasi, audit, adapter | Menampilkan data lintas tenant, membocorkan detail internal |
| Frontend | Menampilkan UI, memanggil API same-origin, format data | Akses database, menyimpan token, memanggil host internal langsung |

## 4. Konvensi kode fungsi

- Agent: `AG-F-nn`
- Database: `DB-F-nn`
- Backend: `BE-F-nn`
- Frontend: `FE-F-nn`

Kode fungsi tidak menggantikan kode modul. Keduanya dipakai bersama: fungsi menjelaskan perilaku, kode modul menjelaskan kepemilikan menu dan izin.

## 5. Hubungan dengan dokumen lain

- Menu dan izin: [peta-modul](../../product/peta-modul.md)
- Kontrak API: [kontrak-api](../../technical/backend/kontrak-api.md)
- Skema database: [database](../../technical/database/README.md)
- Alur data: [data-flow](../data-flow/README.md)
- Pengujian: [unit-test](../unit-test/README.md)
