# Spesifikasi UI osc_site

Status: Disetujui (0.6)

Dokumen ini menjadi acuan tampilan dan interaksi `osc_site`: token desain, kerangka layout, pola komponen, perilaku izin, penanganan error, dan spesifikasi layar kunci. Rute dan menu mengikuti [peta-menu.md](peta-menu.md); bentuk data mengikuti [kontrak API](../backend/kontrak-api.md); izin mengikuti [matriks izin](../../security/matriks-izin.md).

Dokumen ini bukan gambar final. Wireframe dan prototipe boleh berubah, tetapi pola akses, error, bahasa, dan aksesibilitas di bawah ini wajib diikuti.

## 1. Prinsip

1. **Server-first**: data awal dirender Server Component; interaksi berat memakai Client Component.
2. **Scope selalu terlihat**: header menampilkan perusahaan dan area aktif; daftar kosong menjelaskan scope yang sedang dipakai.
3. **Izin bukan dekorasi**: menu tanpa izin tidak dirender; aksi tulis tanpa izin tidak dirender; server tetap memeriksa setiap request.
4. **Tidak ada 403 dan 5xx**: penolakan memakai halaman netral dan envelope `AA00-00-0003`; gangguan layanan memakai pesan ramah dengan `request_id`.
5. **Satu bahasa utama per sesi**: default `en`; pengguna dapat memilih `id`; kode error dan kode modul tidak diterjemahkan.
6. **Tenang dan padat**: tabel rapat, aksi utama jelas, animasi minimal, tanpa data palsu.
7. **Aman secara bawaan**: token tidak pernah masuk storage browser; data sensitif diredaksi; rahasia hanya write-only.
8. **Aksesibel**: WCAG 2.2 AA, navigasi keyboard, fokus terlihat, kontras cukup, dan pengumuman status lewat live region.

## 2. Token desain

Komponen memakai token semantik, bukan nilai warna mentah. Perubahan tema tidak boleh menyentuh komponen satu per satu.

| Token | Pemakaian | Aturan |
|---|---|---|
| `bg.canvas` | Latar halaman | Netral, kontras dengan permukaan |
| `bg.surface` | Kartu, dialog, panel | Naik satu tingkat dari canvas |
| `border.default` | Garis tabel, input | Kontras minimal 3:1 terhadap permukaan |
| `text.primary` | Teks utama | Kontras minimal 4.5:1 |
| `text.secondary` | Metadata, bantuan | Tetap memenuhi 4.5:1 untuk teks kecil |
| `accent.default` | Aksi utama, tautan | Tidak dipakai untuk status |
| `status.success` | Aktif, sehat, selesai | Ikon + teks, bukan warna saja |
| `status.warning` | Degradasi, menunggu | Ikon + teks |
| `status.critical` | Gagal, terkunci, insiden | Ikon + teks |
| `status.info` | Berjalan, informasi | Ikon + teks |
| `status.neutral` | Tidak diketahui, nonaktif | Ikon + teks |

Aturan:

- Warna status tidak boleh menjadi satu-satunya pembeda; selalu ada ikon dan label.
- Grafik memakai palet aman buta warna dan pola berbeda; sumbu memuat satuan.
- Angka metrik memakai angka tabular agar tidak bergeser.
- Dark mode memakai token yang sama; tidak ada hex langsung di komponen.
- Radius dan spacing memakai skala 4 px; elevasi hanya untuk dialog, menu, dan sticky header.

## 3. Kerangka layout

```text
┌──────────── header: perusahaan · area · cari · notifikasi · bahasa · profil ────────────┐
│ banner impersonasi (jika ada, tidak dapat ditutup)                                      │
├───────────┬─────────────────────────────────────────────────────────────────────────────┤
│ sidebar   │ breadcrumb (level 3+)                                                       │
│ modul     │ judul halaman · badge scope · aksi utama                                    │
│           │ tab (jika ada)                                                              │
│           │ konten                                                                      │
└───────────┴─────────────────────────────────────────────────────────────────────────────┘
```

Aturan:

- Sidebar dapat diciutkan; status ciut disimpan per pengguna, bukan per perusahaan.
- Header tetap terlihat saat scroll; tinggi stabil agar tidak menggeser konten.
- Breadcrumb hanya muncul untuk halaman lebih dari dua tingkat.
- Aksi utama berada di kanan judul; aksi sekunder masuk menu `...`.
- Dialog tidak boleh lebih tinggi dari viewport; konten panjang memakai panel samping.
- Mobile: sidebar menjadi drawer, tabel berubah menjadi kartu untuk daftar terpilih, aksi utama menjadi tombol lebar penuh.
- Cetak: label aset dan laporan memakai stylesheet khusus; navigasi tidak ikut tercetak.

Breakpoint:

| Rentang | Perilaku |
|---|---|
| < 768 px | Satu kolom, drawer, tabel kartu atau scroll horizontal |
| 768–1279 px | Sidebar ciut default, dua kolom untuk form panjang |
| ≥ 1280 px | Sidebar penuh, konten maksimal 1440 px |

## 4. Navigasi dan izin

| Kondisi | Perilaku UI |
|---|---|
| Tidak punya izin modul | Menu tidak dirender; rute langsung ke `/access-denied` |
| Punya `read`, tanpa `post` | Aksi tulis tidak dirender; tabel dan detail tetap terbaca |
| Submodul sensitif tanpa izin submodul | Menu dan rute submodul tidak tersedia meski punya izin modul |
| Data di luar scope | Halaman `/not-found`; tampilan sama dengan data tidak ada |
| Sesi kedaluwarsa | Arahkan ke login dengan path kembali; jangan menyimpan data sensitif di URL |
| Ganti perusahaan/area | Invalidasi cache, reset pagination, muat ulang izin; konfirmasi jika ada form kotor |
| Impersonasi aktif | Banner `CG08` permanen berisi aktor asli, alasan, dan sisa waktu |

Aturan tambahan:

- Jangan menonaktifkan aksi hanya karena izin; sembunyikan agar tidak membocorkan fitur.
- Tombol yang tampil tetapi gagal karena race condition harus menampilkan pesan `AA00-00-0003` yang netral, bukan detail internal.
- Deep link divalidasi server; UI tidak boleh menebak scope dari query string.
- Pilihan area hanya berisi area dalam scope pengguna; area tanpa akses tidak ditampilkan sebagai opsi.
- Menu self-service (`/assets/mine`, tiket sendiri, permintaan akses sendiri, preferensi) tampil untuk pengguna terautentikasi; server tetap memfilter data.

## 5. Pola komponen

### 5.1 Tabel data

- Pagination server-side; cursor untuk daftar operasional, nomor halaman untuk laporan.
- State filter, urutan, dan cursor disimpan di URL agar dapat dibagikan dalam scope yang sama.
- Pencarian dikirim ke server; jangan memfilter data sensitif di browser.
- Kolom dapat diatur visibilitasnya; kolom sensitif tetap diredaksi walau ditampilkan.
- Seleksi baris untuk aksi massal hanya jika semua baris dalam scope dan punya izin.
- Header sticky; kolom pertama sticky pada layar sempit.
- Empty state berbeda untuk "belum ada data" dan "tidak ada hasil filter".
- Loading memakai skeleton baris, bukan spinner penuh halaman.
- Error memuat tabel tetap tampil dengan banner dan tombol coba lagi; sertakan `request_id`.
- Ekspor hanya muncul jika pengguna punya izin ekspor dan selalu mengikuti filter scope.

### 5.2 Form

- Label di atas input, penanda wajib, bantuan singkat, dan pesan error inline dari `errors[].field`.
- Saat submit gagal validasi, tampilkan ringkasan di atas form dan fokus ke field pertama yang salah.
- Input yang sudah diisi tidak boleh hilang saat validasi gagal.
- Tombol submit nonaktif selama request berjalan; kirim idempotency key per percobaan.
- Form kotor memicu konfirmasi sebelum pindah halaman.
- Editor JSON (misalnya aturan HRIS) memakai validasi skema dan pesan baris/kolom.
- Input rahasia bersifat write-only: tidak pernah diisi ulang dari server, tidak dapat disalin, dan memakai `autocomplete="new-password"`.
- Unggah file menampilkan jenis dan batas ukuran sebelum memilih file; hasil unggah dicatat di audit.

### 5.3 Dialog persetujuan

Dialog persetujuan dipakai untuk aksi sensitif seperti firewall, deploy, restore, akses, dan review izin.

Isi wajib:

- Pemohon, perusahaan, area, target, dan waktu permintaan.
- Ringkasan dampak, tingkat risiko, dan rencana rollback.
- Diff sebelum/sesudah dengan nilai sensitif diredaksi.
- Alasan persetujuan atau penolakan.
- Batas waktu persetujuan dan status MFA ulang bila diperlukan.
- Tombol setujui dan tolak; keduanya memakai idempotency.

Aturan:

- Pemohon tidak dapat menyetujui permintaannya sendiri; server menolak, UI tidak menampilkan tombol.
- Aksi dengan dual control menampilkan dua approver yang dibutuhkan.
- Setelah keputusan, tampilkan hasil dan tautan ke audit; jangan menutup dialog sebelum respons diterima.
- Perubahan yang kedaluwarsa tidak dapat disetujui; tampilkan status kedaluwarsa.

### 5.4 Aksi merusak

- Konfirmasi menyebut target secara eksplisit, bukan "Apakah Anda yakin?".
- Untuk aksi ireversibel, minta pengguna mengetik nama target.
- Alasan wajib untuk nonaktifkan pengguna, cabut sesi, hapus aset, rotasi QR, dan terminasi sesi akses.
- Tindakan yang dapat dipulihkan tetap menampilkan konsekuensi dan tautan rollback.

### 5.5 Umpan balik

- Toast untuk hasil singkat yang tidak kritis; hilang otomatis setelah 4 detik.
- Banner inline untuk error yang perlu tindakan atau bertahan.
- Error kritis selalu memuat `request_id` dan tombol salin.
- Pusat notifikasi menampilkan pengirim, waktu, scope, dan tautan aksi.
- Notifikasi yang sama tidak diulang dalam satu sesi; deduplikasi dilakukan server.

### 5.6 Grafik metrik

- Memakai uPlot dengan resolusi adaptif; data mentah tidak dimuat sekaligus.
- Sumbu memuat satuan dan zona waktu; tooltip memuat waktu ISO yang diformat locale.
- Celah data ditampilkan sebagai celah, bukan garis interpolasi palsu.
- Sumber data (OmniSight, Beszel, LibreNMS) diberi label.
- Tersedia tampilan tabel sebagai alternatif aksesibel.

### 5.7 Penampil audit

- Filter aktor, aksi, modul, waktu, `request_id`, dan hasil.
- Diff dua kolom; nilai sensitif diredaksi sebelum dikirim server.
- `request_id` dapat disalin; tautan log internal hanya untuk peran berwenang.
- Tidak ada aksi ubah atau hapus.
- Ekspor memerlukan alasan dan izin `AL05:post`.

### 5.8 Kredensial dan API key

- Kredensial hanya dapat ditulis, diuji, dan dirotasi; nilai lama tidak pernah ditampilkan.
- API key ditampilkan sekali saat dibuat, dengan peringatan simpan aman.
- Daftar API key menampilkan scope, pembuat, waktu dibuat, dan waktu terakhir dipakai.
- Rotasi meminta konfirmasi dan mencatat audit.

### 5.9 Pemilih bahasa

- Tersedia di header (`CG09`) dan `/profile/preferences`.
- Memanggil `PATCH /auth/me`, memperbarui cookie `OSC_LOCALE`, dan memuat ulang pesan server.
- Perubahan berlaku tanpa logout dan tanpa memuat ulang data lintas tenant.
- Tidak boleh menyebabkan hydration mismatch; pesan awal memakai locale dari cookie.

## 6. Spesifikasi layar kunci

| Layar | Rute | Fokus | Keadaan wajib |
|---|---|---|---|
| Login lokal | `/login` | Form ringkas, pesan gagal generik, batas percobaan | Loading, lockout countdown, error `AB-*`, tautan HRIS |
| Login HRIS | `/login/hris` | Pilih perusahaan, status koneksi HRIS | HRIS tidak tersedia, kredensial tidak sesuai, fallback kebijakan |
| MFA | `/mfa` | Kode sekali pakai, opsi perangkat | Kode salah, kedaluwarsa, kembali ke login |
| Pilih perusahaan | `/select-company` | Kartu membership, peran, area | Satu perusahaan langsung lanjut, nol membership ditolak |
| Dashboard | `/dashboard` | Kartu scope, tugas saya, aktivitas | Data kosong, sebagian modul gagal dimuat |
| Aset fisik | `/assets/items` | Tabel, filter status/lokasi, check-out | Read-only viewer, QR rusak, konflik versi |
| Alert | `/monitoring/alerts` | Daftar alert, fingerprint, ack | Silence dengan batas waktu, alert flapping |
| Deploy | `/containers/deployments` | Plan, digest, risiko, approval | Image tidak pinned, approval tertunda |
| Restore | `/backups/restores` | Dampak, target, snapshot pengaman | Dual control, approval kedaluwarsa |
| Audit trail | `/audit/events` | Filter, diff, request id | Redaksi, ekspor tanpa izin |
| Kredensial | `/settings/credentials` | Daftar referensi, uji koneksi | Write-only, uji gagal |
| Impersonasi | `/settings/impersonation` | Mulai sesi, alasan, durasi | MFA baru, banner aktif, batas waktu |

Setiap layar wajib memiliki: judul, badge scope, aksi utama, keadaan loading, keadaan kosong, keadaan error, dan tautan bantuan kontekstual.

## 7. Pemetaan error envelope ke UI

Daftar lengkap kode, pemicu, dan retry ada di [registry kode error](../backend/kode-error.md). Tabel berikut mengatur perilaku tampilan.

| Kode | Perilaku UI | Catatan |
|---|---|---|
| `AA00-00-0000` | Tampilkan data | Normal |
| `AA00-00-0001` | Ringkasan + error inline per field | Fokus ke field pertama |
| `AA00-00-0002` | Arahkan ke login, simpan path kembali | Jangan tampilkan detail sesi |
| `AA00-00-0003` | Halaman `/access-denied` netral | Bukan 403; aksi dicatat server |
| `AA00-00-0004` | Halaman `/not-found` | Sama untuk data tidak ada dan di luar scope |
| `AA00-00-0005` | Banner konflik, muat versi terbaru, tampilkan diff | Jangan menimpa diam-diam |
| `AA00-00-0006` | Countdown, nonaktifkan aksi sementara | Tampilkan waktu tunggu |
| `AA00-00-0007` | Anggap submit ganda; rekonsiliasi hasil | Jangan kirim ulang buta |
| `AA00-00-0008` | Pesan tidak didukung + `request_id` | Umumnya bug klien |
| `AA00-00-0009` | Pesan ukuran/jenis file | Tampilkan batas sebelum unggah |
| `AA00-00-0010` | Pesan generik + `request_id` + bantuan | Tidak menampilkan stack atau SQL |
| `AA00-00-0900` | Banner layanan terganggu, tombol coba lagi | Jangan menampilkan 5xx mentah |
| Kode modul | Pesan dari server pada field/bagian terkait | Kode tetap terlihat di detail |

Aturan:

- `message` dan `reason` dari server dipakai apa adanya karena sudah terlokalisasi.
- Kode yang tidak dikenal jatuh ke pesan generik; jangan menampilkan teks mentah.
- `request_id` selalu dapat disalin dari panel detail error.
- Halaman error tidak boleh memuat data tenant lain atau jejak internal.
- Retry otomatis hanya untuk operasi baca yang idempoten.

## 8. Lokalisasi

- Semua teks UI berasal dari katalog `en`/`id`; tidak ada string langsung di komponen.
- Kunci memakai dot.case dan namespace per fitur; paritas kunci diperiksa CI.
- Kunci yang hilang jatuh ke `en`, bukan halaman error.
- Tanggal, waktu, angka, dan durasi diformat di klien memakai `Intl`; API mengirim ISO 8601 atau nilai mentah.
- Jangan menyusun kalimat dengan penggabungan string; gunakan pesan berparameter dan plural rules.
- Nama modul, kode error, dan kode status tidak diterjemahkan.
- Perubahan bahasa tidak mengubah rute, izin, atau scope.

## 9. Aksesibilitas

- Struktur landmark: header, navigasi, utama, komplementer; sediakan tautan lewati navigasi.
- Fokus terlihat di semua elemen interaktif; dialog memerangkap fokus dan mengembalikannya saat ditutup.
- Tabel dapat dinavigasi keyboard; header memakai `scope`; aksi baris punya label aksesibel.
- Pesan error terhubung ke input lewat `aria-describedby`; ringkasan error memakai live region.
- Toast dan perubahan status memakai live region sopan; error kritis memakai assertive.
- Target sentuh minimal 24×24 px; jangan mengandalkan hover untuk aksi penting.
- Hormati `prefers-reduced-motion`; animasi tidak wajib untuk memahami perubahan.
- Kontras teks minimal 4.5:1 dan elemen grafis minimal 3:1.
- Uji axe di CI dan uji keyboard manual untuk alur login, tabel, form, dan approval.

## 10. Performa

- Data awal dari Server Component; interaksi lanjutan memakai TanStack Query.
- Skeleton per bagian; jangan memblokir seluruh halaman karena satu panel lambat.
- Pagination cursor untuk daftar besar; virtualisasi hanya untuk daftar panjang yang sudah dimuat.
- Grafik dan editor berat dimuat lazy.
- Prefetch terbatas pada tautan yang terlihat dan sesuai izin.
- Tidak ada skrip pihak ketiga yang memblokir render.
- Anggaran bundel ditinjau per rute; kenaikan besar harus disertai alasan.

## 11. Keamanan UI

- Token sesi hanya di cookie HttpOnly; tidak ada token di `localStorage`/`sessionStorage`.
- Request tulis memakai CSRF token dan origin yang sama.
- Markdown pengguna disanitasi dengan allowlist; tidak ada `dangerouslySetInnerHTML` untuk input pengguna.
- Data identifier pada layar sensitif disamarkan; clipboard untuk rahasia dinonaktifkan.
- Jangan menaruh rahasia, token, atau data pribadi di URL, judul halaman, atau log klien.
- Sesi menganggur memicu peringatan sebelum logout; aksi sensitif meminta MFA ulang.
- Banner impersonasi tidak dapat ditutup dan selalu menyebut aktor asli.
- Perubahan scope memicu invalidasi cache agar data tenant lama tidak tertinggal.

## 12. Checklist

- [ ] Setiap menu dan aksi memeriksa izin; server tetap memeriksa.
- [ ] Tidak ada halaman 403; akses ditolak memakai `/access-denied`.
- [ ] Semua error envelope dipetakan dan menampilkan `request_id`.
- [ ] Form memakai idempotency dan tidak kehilangan input saat gagal.
- [ ] Approval menampilkan diff, risiko, alasan, dan larangan self-approval.
- [ ] Rahasia bersifat write-only dan tidak masuk log.
- [ ] Katalog `en`/`id` paritas; tidak ada teks UI hardcoded.
- [ ] Token tidak disimpan di browser.
- [ ] Aksesibilitas WCAG AA diuji dengan axe dan keyboard.
- [ ] Layout responsif diuji pada tiga breakpoint.
- [ ] Data di luar scope tidak bocor lewat UI, URL, atau cache.

## 13. Dokumen terkait

- [Peta menu](peta-menu.md)
- [Alur dan arsitektur frontend](alur-dan-arsitektur.md)
- [Kontrak API](../backend/kontrak-api.md)
- [Matriks izin](../../security/matriks-izin.md)
- [Panduan pengguna](../../product/panduan-pengguna.md)
- [Fungsi frontend](../../qaqc/function/frontend/README.md)
- [UAT global](../../qaqc/acceptance/README.md)
