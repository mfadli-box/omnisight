# Runbook Impor dan Migrasi Data

Status: Disetujui (0.6)

Dokumen ini mengatur pemindahan data awal ke OmniSight: onboarding perusahaan, impor aset, inventaris jaringan, pengguna, dan data layanan dari sistem lama. Impor data berbeda dari restore database; prosedur restore ada di [operations/README.md](README.md) bagian Restore.

Prinsip utamanya: **uji di staging, jalankan dry-run, minta persetujuan, commit dengan jejak audit, lalu rekonsiliasi**. Data asli tidak boleh dipakai di development.

## 1. Ruang lingkup

| Sumber | Data yang diimpor | Modul |
|---|---|---|
| HRIS | Pengguna, status aktif, unit/area, mapping peran | AB |
| Snipe-IT atau CSV | Kategori, model, aset, serial, lokasi, penanggung jawab | AC |
| NetBox atau CSV | Site, rack, perangkat, interface, prefix, IP, VLAN | AD |
| GLPI (opsional) | Tiket terbuka, kategori, kontrak | AJ |
| Directus (opsional) | Artikel dan halaman | AK |
| Manual/CSV | Perusahaan, area, lokasi, peran khusus | AB, AC |

Yang tidak diimpor:

- Password, hash password, token, kunci API, dan sertifikat privat.
- Data pribadi yang tidak diperlukan untuk operasi.
- Riwayat audit sistem lama; audit OmniSight dimulai dari impor.
- File lampiran tanpa klasifikasi dan persetujuan pemilik data.

## 2. Peran dan tanggung jawab

| Peran | Tanggung jawab |
|---|---|
| Import operator | Menyiapkan sumber, mapping, dry-run, dan menjalankan batch |
| Data owner | Memastikan data boleh dipindahkan dan akurat |
| Approver | Menyetujui commit batch dan perubahan scope |
| Auditor | Memeriksa bukti, laporan dry-run, dan hasil rekonsiliasi |
| Security | Meninjau data sensitif, akses sementara, dan penghapusan file |

Aturan:

- Import operator tidak boleh menyetujui batch yang ia jalankan.
- Akses tulis impor memakai izin modul terkait (`AB02:post`, `AC:post`, `AD:post`) dan scope perusahaan.
- Impor lintas perusahaan hanya oleh peran platform dengan audit khusus.
- Kredensial sumber data memakai referensi vault, bukan file teks.

## 3. Urutan impor

Urutan wajib karena dependensi:

```text
1. Perusahaan
2. Area dan lokasi
3. Peran dan kebijakan
4. Pengguna dan membership
5. Kategori dan model aset
6. Aset fisik dan penempatan
7. Site, rack, dan perangkat jaringan
8. Prefix, VLAN, dan IP
9. Tiket dan kontrak (opsional)
10. Artikel dan halaman (opsional)
```

Aturan:

- Jangan mengimpor aset sebelum perusahaan, area, dan lokasi ada.
- Jangan mengimpor penanggung jawab sebelum membership aktif.
- Jangan mengimpor IP sebelum prefix dan VLAN ada.
- Impor tahap berikutnya menunggu rekonsiliasi tahap sebelumnya selesai.

## 4. Alur impor

### 4.1 Preflight

1. Pastikan perusahaan dan area target sudah benar.
2. Ambil backup database sebelum commit.
3. Siapkan staging dengan versi aplikasi yang sama.
4. Siapkan file sumber, mapping, dan laporan dry-run.
5. Pastikan akun operator memakai MFA dan scope minimal.
6. Tentukan jadwal di luar jam sibuk.

### 4.2 Ekstraksi dan pembekuan sumber

- Ekspor data dari sistem lama pada waktu yang disepakati.
- Catat waktu ekspor, versi sumber, dan jumlah baris.
- Simpan salinan di direktori terenkripsi dengan permission ketat.
- Jangan mengubah file sumber setelah ekspor; perubahan berikutnya menjadi delta.

### 4.3 Mapping field

Setiap sumber memiliki dokumen mapping berisi:

- Nama field sumber dan field target.
- Nilai enum yang dipetakan.
- Aturan default dan nilai wajib.
- Field yang sengaja tidak diimpor.
- Pemilik keputusan mapping.

Contoh mapping aset:

| Sumber | Target | Aturan |
|---|---|---|
| `asset_tag` | `asset.assets.asset_tag` | Wajib, unik per perusahaan |
| `serial` | `asset.assets.serial` | Unik per perusahaan bila diisi |
| `status.label` | `asset.assets.status` | Petakan ke enum; nilai tak dikenal ditolak |
| `location.name` | `asset.locations.code` | Harus ada di area yang sama |
| `assigned_to.email` | membership pengguna | Harus anggota perusahaan |

### 4.4 Validasi

Validasi dilakukan dua lapis:

| Lapis | Contoh |
|---|---|
| Sintaks | Tipe data, panjang, format tanggal ISO 8601, format email, angka |
| Bisnis | Perusahaan/area/lokasi konsisten, membership aktif, serial unik, IP dalam prefix, status valid, referensi tidak lintas tenant |

Aturan:

- Baris dengan error tidak masuk commit; seluruh batch ditolak kecuali mode parsial disetujui.
- Peringatan (misalnya nilai default dipakai) dicatat dan harus disetujui.
- Validasi memakai aturan yang sama dengan API; impor tidak boleh melewati foreign key atau RLS.

### 4.5 Dry-run

Dry-run wajib dan tidak menulis data domain. Laporan memuat:

- Nomor baris, kunci unik, dan aksi yang akan dilakukan (`create`, `update`, `skip`, `error`).
- Pesan error dan peringatan.
- Ringkasan jumlah per aksi dan per area.
- Daftar referensi yang tidak ditemukan.
- Perkiraan jumlah aset, pengguna, dan IP baru.
- Hash file sumber dan waktu eksekusi.

Dry-run disimpan sebagai artefak dan dilampirkan ke approval.

### 4.6 Approval

- Approver memeriksa laporan dry-run, cakupan, dan dampak.
- Approval memiliki batas waktu 24 jam.
- Jika file sumber berubah, approval batal dan dry-run diulang.
- Approval dan commit dicatat di audit dengan `request_id` yang sama.

### 4.7 Commit

- Commit memakai satu `batch_id` dan idempotency key.
- Batch besar dipecah per 5.000–10.000 baris dengan checkpoint.
- Setiap batch mencatat jumlah dibuat, diubah, dilewati, dan gagal.
- Jika satu chunk gagal, hentikan batch dan jangan lanjut tanpa persetujuan.
- Jangan menjalankan dua impor yang menyentuh entitas yang sama secara bersamaan.

### 4.8 Rekonsiliasi

Setelah commit:

1. Bandingkan jumlah sumber dan target.
2. Periksa checksum atau hash laporan.
3. Sampling acak minimal 20 baris per jenis data.
4. Uji login pengguna hasil impor.
5. Uji isolasi dua perusahaan.
6. Uji pencarian QR aset dan laporan aset.
7. Periksa audit berdasarkan `batch_id` dan `request_id`.

### 4.9 Arsip dan pembersihan

- Simpan laporan dry-run, hasil commit, dan bukti approval sesuai kebijakan retensi.
- Hapus file sumber sementara dan salinan kerja setelah rekonsiliasi disetujui.
- Catat penghapusan file di log operasi.
- Jangan menyimpan data pribadi di tiket, chat, atau email.

## 5. Format CSV

| Aturan | Nilai |
|---|---|
| Encoding | UTF-8 |
| Pemisah | Koma; kutip field yang memuat koma |
| Header | Wajib, nama kolom snake_case |
| Tanggal | ISO 8601, misalnya `2026-10-30` |
| Waktu | ISO 8601 UTC, misalnya `2026-10-30T09:00:00Z` |
| Boolean | `true`/`false` |
| Kosong | String kosong berarti null |
| Baris maksimum per file | 10.000 |
| Ukuran maksimum | 20 MB |

Aturan keamanan:

- File CSV dapat memuat formula; impor memperlakukan semua nilai sebagai teks dan tidak mengeksekusinya.
- Jangan membuka file sumber di aplikasi yang mengeksekusi formula.
- Nilai yang diawali `=`, `+`, `-`, atau `@` dipertahankan sebagai teks dan ditandai di laporan.
- Kolom rahasia atau sensitif ditolak oleh validator.

## 6. Kunci unik dan duplikat

| Entitas | Kunci | Perilaku duplikat |
|---|---|---|
| Perusahaan | `code` | Tolak; jangan buat duplikat |
| Area | `company_code` + `code` | Tolak |
| Lokasi | `area_code` + `code` | Tolak |
| Pengguna | `company_code` + `email` atau `external_id` | Update membership bila disetujui; selain itu tolak |
| Aset | `company_code` + `asset_tag` | Tolak; serial duplikat juga tolak |
| Perangkat | `company_code` + `name` | Tolak |
| Prefix | `company_code` + `prefix` | Tolak |
| IP | `prefix` + `address` | Tolak |

Aturan:

- Mode default adalah `strict`: satu error membatalkan batch.
- Mode `partial` hanya untuk data non-kritis dan harus disetujui approver.
- Jangan memakai nama sebagai satu-satunya kunci; gunakan kode stabil.
- Jangan menimpa data yang diubah pengguna setelah impor tanpa diff dan persetujuan.

## 7. Rollback

Rollback impor berbeda dari restore penuh.

| Skenario | Tindakan |
|---|---|
| Batch gagal sebelum commit | Tidak ada perubahan; perbaiki dan ulangi |
| Commit gagal di tengah chunk | Hentikan; gunakan checkpoint dan laporan untuk membatalkan baris yang sudah masuk |
| Data baru salah dan belum dipakai | Hapus baris berdasarkan `batch_id`, dengan audit |
| Data baru sudah dipakai | Jangan hapus; lakukan koreksi melalui alur normal atau restore terkontrol |
| Update menimpa nilai lama | Kembalikan dari nilai sebelum/sesudah di audit atau restore |

Aturan:

- Rollback memerlukan approval dan alasan.
- Rollback tidak boleh menghapus audit.
- Jika rollback menyentuh data yang sudah dipakai, gunakan prosedur restore terkontrol.
- Setiap rollback mencatat `batch_id`, jumlah baris, dan hasil.

## 8. Impor awal HRIS

1. Uji koneksi HRIS di `AB04` memakai kredensial vault.
2. Jalankan tarik data (GET) atau kirim permintaan (POST) sesuai kontrak adapter.
3. Petakan field dan peran; jangan mengimpor password.
4. Simulasikan hasil tanpa menulis; periksa konflik dan pengguna tanpa unit.
5. Setujui dan jalankan sinkronisasi awal di luar jam sibuk.
6. Setelah sinkronisasi awal, aktifkan delta berkala.
7. Tinjau pengguna yang dinonaktifkan; jangan hapus otomatis tanpa kebijakan.

Konflik HRIS:

| Konflik | Keputusan awal |
|---|---|
| Email sama, external ID berbeda | Tahan, minta review data owner |
| Pengguna ada di HRIS, tidak ada di OmniSight | Buat membership bila area valid |
| Pengguna ada di OmniSight, tidak ada di HRIS | Nonaktifkan setelah masa tenggang sesuai kebijakan |
| Peran berbeda | HRIS memetakan peran; perubahan manual tercatat |

Aturan: kegagalan HRIS tidak boleh membuat fallback lokal otomatis tanpa persetujuan keamanan.

## 9. Verifikasi pasca-impor

- [ ] Jumlah perusahaan, area, lokasi, pengguna, aset, perangkat, dan IP sesuai laporan.
- [ ] Tidak ada relasi lintas perusahaan.
- [ ] Tidak ada aset tanpa lokasi atau penanggung jawab yang tidak valid.
- [ ] Serial dan asset tag unik.
- [ ] IP berada dalam prefix dan tidak bentrok.
- [ ] Login pengguna hasil impor berhasil; MFA sesuai kebijakan.
- [ ] Scope area membatasi data dengan benar.
- [ ] QR aset dapat dicetak dan dipindai.
- [ ] Laporan dan ekspor hanya memuat scope.
- [ ] Audit dapat dicari dengan `batch_id` dan `request_id`.
- [ ] File sementara sudah dihapus.

## 10. Keamanan dan kepatuhan

- Minimalisasi data: impor hanya field yang dipakai.
- Data pribadi tidak boleh masuk development atau staging tanpa penyamaran.
- Transfer memakai TLS; file disimpan terenkripsi dan permission 0600.
- Akses ke file sumber dibatasi dan dicatat.
- Jangan memakai data produksi untuk demo atau pelatihan.
- Retensi file sumber mengikuti kebijakan data owner; hapus setelah tidak diperlukan.
- Insiden kebocoran mengikuti prosedur keamanan.

## 11. Performa dan penjadwalan

- Impor besar dijalankan di luar jam sibuk.
- Batch 5.000–10.000 baris; pantau pool database dan latency.
- Jangan menjalankan impor bersamaan dengan migrasi atau backup penuh.
- Hentikan impor jika error rate atau latency melewati ambang.
- Uji beban di staging dengan volume serupa sebelum produksi.

## 12. Checklist operator

- [ ] Backup sebelum commit.
- [ ] Mapping disetujui data owner.
- [ ] Dry-run bersih atau peringatan disetujui.
- [ ] Approval commit masih berlaku.
- [ ] Batch id dan idempotency key dicatat.
- [ ] Rekonsiliasi selesai.
- [ ] Audit dapat ditemukan.
- [ ] File sementara dihapus.
- [ ] Laporan disimpan sebagai bukti.

## 13. Dokumen terkait

- [Operasi dan deployment](README.md)
- [Alert dan eskalasi](alert-dan-eskalasi.md)
- [Skema inti](../technical/database/skema-inti.md)
- [Skema aset dan jaringan](../technical/database/skema-aset-jaringan.md)
- [Kontrak API](../technical/backend/kontrak-api.md)
- [Matriks izin](../security/matriks-izin.md)
- [UAT Identitas](../qaqc/acceptance/ab-identity.md)
- [UAT Aset](../qaqc/acceptance/ac-assets.md)
- [UAT Jaringan](../qaqc/acceptance/ad-network.md)
