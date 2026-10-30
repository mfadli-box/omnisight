# UAT Modul AD Jaringan dan IPAM

Status: Disetujui (0.6)

## 1. Cakupan

Site, rack, perangkat, IPAM, VLAN, topologi, RouterOS, firewall, maintenance, dan integrasi NetBox/LibreNMS.

## 2. Prasyarat

- Stub RouterOS dan perangkat SNMP.
- Area dengan prefix dan VLAN yang belum terpakai.
- Akun `noc_operator`, `area_manager`, `company_admin`, `viewer`, dan approver terpisah.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AD-01 | Rack dan perangkat | area_manager | Buat site, rack, dan perangkat; ulangi nama pada area sama | Data dibuat; duplikat `AA00-00-0005`; perangkat tidak dapat menunjuk rack area lain | BE-F-06, DB-F-03 |
| UAT-AD-02 | IPAM dan VLAN | noc_operator | Alokasikan IP; alokasikan IP yang tumpang tindih; hapus alokasi | Alokasi berhasil; tumpang tindih ditolak `AA00-00-0001`; pelepasan mengembalikan status dan tercatat | BE-F-06, DB-F-03 |
| UAT-AD-03 | Topologi lintas tenant | area_manager | Hubungkan interface ke perangkat perusahaan lain | Ditolak `AA00-00-0001`; tidak ada link lintas perusahaan | BE-F-06, DB-F-03 |
| UAT-AD-04 | Firewall plan sampai eksekusi | noc_operator dan approver | Buat rencana terstruktur; lihat diff dan risiko; minta approval; eksekusi; verifikasi | Tanpa approval `AD-06-3001`; setelah approval dan MFA berhasil; snapshot dibuat sebelum eksekusi; audit memuat diff dan hasil | BE-F-07, BE-F-08, FE-F-07 |
| UAT-AD-05 | Approval tidak sah | noc_operator | Setujui permintaan sendiri; minta approval dari pengguna tanpa `AD06:post`; pakai approval kedaluwarsa | Self-approval ditolak; approver tanpa izin ditolak; approval kedaluwarsa ditolak; semuanya `AA00-00-0003` atau `AA00-00-0001` | BE-F-05, BE-F-07 |
| UAT-AD-06 | Rollback otomatis | noc_operator | Putuskan koneksi manajemen setelah apply; tunggu verifikasi | Rollback dijalankan; kode `AD-06-3002`; audit memuat alasan dan snapshot yang dipulihkan | BE-F-07, AG-F-06 |
| UAT-AD-07 | Tanpa perintah bebas | noc_operator | Kirim aksi di luar allowlist; kirim parameter berbahaya | Ditolak; tidak ada eksekusi; pesan tidak membocorkan detail perangkat; percobaan tercatat | BE-F-10, AG-F-06 |
| UAT-AD-08 | Kredensial perangkat | company_admin | Buka detail RouterOS; uji koneksi; periksa vault | Kredensial hanya referensi vault; nilai rahasia tidak pernah tampil; uji koneksi memakai akun terbatas | BE-F-10, FE-F-06 |
| UAT-AD-09 | Sinkronisasi inventory | company_admin | Jalankan sync NetBox/LibreNMS dua kali; matikan integrasi di tengah sync | Sync idempotent; kegagalan tidak mengubah inventory setengah jalan; retry aman; audit mencatat hasil | BE-F-08, BE-F-10 |
| UAT-AD-10 | Scope dan peran | noc_operator area A dan viewer | Akses perangkat area A dan area B; buka menu firewall | Area A berhasil; area B `AA00-00-0004`; viewer hanya baca; NOC dapat merencanakan tetapi tidak menyetujui sendiri | BE-F-05, DB-F-02 |

## 4. Kriteria lulus

- Tidak ada perubahan firewall tanpa approval, snapshot, dan audit.
- Tidak ada jalur perintah bebas ke RouterOS.
- Kredensial perangkat tidak pernah dikembalikan API atau ditampilkan UI.
- Sinkronisasi inventaris aman diulang dan gagal tanpa data parsial.
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

`BE-F-05`, `BE-F-06`, `BE-F-07`, `BE-F-08`, `BE-F-10`, `AG-F-06`, `DB-F-02`, `DB-F-03`, `FE-F-06`, `FE-F-07`
