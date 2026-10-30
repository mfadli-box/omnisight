# Registry Kode Error

Status: Disetujui (0.6)

Dokumen ini adalah sumber tunggal untuk kode error OmniSight. Setiap kode yang dipakai di API, frontend, UAT, dan log harus terdaftar di sini. Format, kebijakan HTTP, dan envelope mengikuti [kontrak API](kontrak-api.md); perilaku tampilan mengikuti [spesifikasi UI](../frontend/spesifikasi-ui.md).

## 1. Prinsip

1. **Kode stabil**: kode tidak berubah meski pesan, bahasa, atau implementasi berubah.
2. **Tanpa 403 dan 5xx aplikasi**: hasil bisnis memakai HTTP 200 dengan envelope.
3. **Pesan generik untuk autentikasi**: tidak membedakan akun tidak ada, password salah, atau alasan internal.
4. **Tidak membocorkan detail**: tidak ada stack trace, SQL, host, nama tabel, atau rahasia.
5. **Satu kode, satu arti**: kode yang sudah dipakai tidak boleh dipakai ulang untuk arti lain.
6. **Terlokalisasi**: kode sama di semua bahasa; `message` dan `reason` mengikuti locale.
7. **Dapat diuji**: setiap kode punya pemicu dan skenario UAT atau unit test.

## 2. Format

```text
Global : AA00-00-xxxx
Modul  : <modul>-<submenu>-<nomor>
Contoh : AC-04-2001
```

Aturan:

- `<modul>` adalah dua huruf `AA`–`AM`.
- `<submenu>` adalah dua digit submenu; gunakan `00` untuk kode tingkat modul.
- `<nomor>` adalah empat digit unik dalam modul.
- Tidak ada arti khusus pada digit pertama nomor; kode yang sudah ada dipertahankan.
- Submenu dan modul harus ada di [peta modul](../../product/peta-modul.md).
- Kode tidak menyiratkan status HTTP.

## 3. Kode global

| Kode | Arti | Pemicu | Retry | Catatan UI |
|---|---|---|---|---|
| `AA00-00-0000` | Sukses | Request berhasil | - | Tampilkan data |
| `AA00-00-0001` | Validasi gagal | Field tidak valid | Perbaiki input | Error inline per field |
| `AA00-00-0002` | Belum terautentikasi | Sesi tidak ada/kedaluwarsa | Login ulang | Arahkan ke login |
| `AA00-00-0003` | Akses ditolak | Izin/scope tidak cukup | Tidak | Halaman akses ditolak |
| `AA00-00-0004` | Tidak ditemukan / di luar scope | ID tidak ada atau beda tenant | Tidak | Halaman tidak ditemukan |
| `AA00-00-0005` | Konflik versi / duplikat | Versi berubah atau unik bentrok | Muat ulang | Banner konflik + diff |
| `AA00-00-0006` | Terlalu banyak permintaan | Rate limit | Tunggu | Countdown |
| `AA00-00-0007` | Idempotency bentrok | Kunci sama, body berbeda | Tidak buta | Rekonsiliasi hasil |
| `AA00-00-0008` | Metode/format tidak didukung | Method atau media type salah | Tidak | Pesan umum |
| `AA00-00-0009` | Payload terlalu besar | Melebihi batas | Perkecil | Pesan batas ukuran |
| `AA00-00-0010` | CSRF tidak valid | Token CSRF salah/kedaluwarsa | Sekali | Muat token baru |
| `AA00-00-0100` | Error internal generik | Panic/error tak tertangani | Mungkin | Pesan umum + `request_id` |
| `AA00-00-0900` | Layanan pendukung tidak tersedia | Adapter/dependency gagal | Ya, dengan jeda | Banner layanan terganggu |

Aturan:

- `0002` pada endpoint publik tidak dipakai; endpoint publik mengembalikan data publik atau `0004`.
- `0003` dan `0004` tidak boleh membedakan data milik tenant lain.
- `0006` menyertakan sisa waktu tunggu di `meta`.
- `0100` dan `0900` wajib memicu metrik dan alert; detail hanya di log internal.
- `0003` dicatat sebagai penolakan otorisasi dan dihitung, bukan dianggap serangan otomatis.

## 4. Kode modul yang sudah dipakai

| Kode | Modul/submenu | Arti | Pemicu | Retry | Tindakan |
|---|---|---|---|---|---|
| `AB-00-1004` | AB Login lokal | Email/password salah | Kredensial tidak cocok | Tidak | Audit login gagal, pesan generik |
| `AB-02-1003` | AB02 Pengguna | Tidak ada membership aktif | Login tanpa membership | Tidak | Tolak akses, arahkan admin |
| `AB-04-1001` | AB04 HRIS | HRIS menolak kredensial | HRIS 401/403 | Tidak | Pesan generik, audit |
| `AB-04-1002` | AB04 HRIS | HRIS tidak tersedia | 5xx/timeout | Ya, fail-closed | Fail-closed, alert HRIS |
| `AB-04-1005` | AB04 HRIS | HRIS rate limit | 429 | Backoff | Hormati `Retry-After` |
| `AB-04-1006` | AB04 HRIS | Respons HRIS tidak sesuai skema | Parsing/mapping gagal | Tidak | Fail-closed, alert admin |
| `AB-04-1007` | AB04 HRIS | Mapping role tidak ditemukan | Role map tidak valid | Tidak | Tolak login, log admin |
| `AC-04-2001` | AC04 Check-out | Aset sedang dipinjam | Check-out ganda | Tidak | Tampilkan pemegang saat ini bila boleh |
| `AD-06-3001` | AD06 Firewall | Perubahan memerlukan persetujuan | Belum ada approval | Setelah approval | Tautkan ke permintaan |
| `AD-06-3002` | AD06 Firewall | Rollback firewall dijalankan | Koneksi manajemen hilang | Tidak | Insiden + audit |
| `AF-04-4001` | AF04 Deploy | Image tidak dipin ke digest | Compose tidak pinned | Perbaiki | Tolak plan/deploy |
| `AF-04-4002` | AF04 Deploy | Health check gagal, rollback | Deploy tidak sehat | Tidak | Rollback + insiden |
| `AH-04-5001` | AH04 Restore | Restore memerlukan persetujuan | Belum ada approval | Setelah approval | Dual control |
| `AI-02-6001` | AI02 Akses | Permintaan akses kedaluwarsa | Melewati waktu berlaku | Ajukan baru | Tolak approval |

Aturan:

- Kode di atas adalah kode yang sudah dirujuk dokumen; kode baru wajib ditambahkan ke tabel ini sebelum dipakai.
- Jangan memakai `AA00-00-0005` untuk duplikat bisnis yang punya kode modul spesifik; gunakan kode modul bila sudah ada.
- Kode HRIS `AB-04-*` tidak boleh membocorkan status internal HRIS ke pengguna.
- Kode firewall, deploy, restore, dan akses harus dapat ditautkan ke approval dan audit.

## 5. Kode field

`errors[]` pada validasi memakai kode field yang stabil dan tidak diterjemahkan.

| Kode field | Arti |
|---|---|
| `required` | Field wajib kosong |
| `invalid_format` | Format tidak sesuai |
| `out_of_scope` | Nilai di luar scope pengguna |
| `not_found` | Referensi tidak ditemukan |
| `duplicate` | Nilai sudah dipakai |
| `conflict` | Bertentangan dengan status saat ini |
| `too_long` | Melebihi panjang |
| `unsupported_value` | Nilai tidak didukung |
| `expired` | Nilai/token sudah kedaluwarsa |
| `not_allowed` | Aksi tidak diizinkan untuk keadaan ini |

Aturan:

- `reason` menjelaskan field secara aman dan terlokalisasi.
- Jangan memakai kode field untuk menyembunyikan penolakan otorisasi; gunakan `AA00-00-0003`.
- Jangan menampilkan nilai sensitif di `reason`.

## 6. Lokalisasi

- Kunci pesan backend: `error.<kode>`, misalnya `error.AB-04-1001`.
- Kunci pesan field: `validation.<kode>`, misalnya `validation.required`.
- Katalog `en` dan `id` wajib memiliki kunci yang sama.
- Kunci hilang jatuh ke `en`, bukan halaman error.
- Kode tidak pernah diterjemahkan atau diubah huruf besar/kecil.
- Pesan autentikasi memakai teks generik yang sama untuk semua kegagalan kredensial.
- Frontend memakai `message`/`reason` dari server; jika kode tidak dikenal, tampilkan pesan umum dan `request_id`.

## 7. Audit, metrik, dan alert

| Kejadian | Audit | Metrik | Alert |
|---|---|---|---|
| `0003` akses ditolak | Ya | `authz_denied_total{module,reason}` | Spike → `ALT-PLAT-05` |
| `0002` sesi gagal | Ya | `auth_session_failed_total` | Spike → `ALT-SEC-01` |
| `0001` validasi | Tidak wajib | `validation_failed_total{module}` | Tidak |
| `0005` konflik | Ya bila aksi tulis | `conflict_total{module}` | Tidak |
| `0006` rate limit | Ya | `rate_limited_total` | Spike → review |
| `0100` internal | Ya | `internal_error_total` | `ALT-PLAT-03` |
| `0900` dependency | Ya | `dependency_unavailable_total` | `ALT-PLAT-04` |
| `AB-04-1002/1006` | Ya | `hris_failure_total{reason}` | Alert HRIS |

Aturan:

- Label metrik tidak memuat `user_id`, email, IP penuh, atau `request_id`.
- Kode error tidak boleh menjadi label bebas dari input pengguna.
- Setiap alert yang merujuk kode error menautkan runbook di [alert dan eskalasi](../../operations/alert-dan-eskalasi.md).

## 8. Proses menambah kode

1. Ajukan kebutuhan kode dengan pemicu, modul, submenu, dan dampak keamanan.
2. Backend Lead memeriksa apakah kode global atau kode modul yang ada sudah cukup.
3. Security meninjau kode yang menyentuh autentikasi, otorisasi, data sensitif, atau aksi destruktif.
4. Tambahkan baris di registry ini dan catatan di [kontrak API](kontrak-api.md).
5. Tambahkan kunci `en` dan `id`.
6. Petakan perilaku UI bila berbeda dari kode global.
7. Tambahkan skenario UAT atau unit test yang memicu kode.
8. Perbarui OpenAPI dan klien TypeScript pada perubahan yang sama.
9. Rilis dan pantau; jangan mengubah arti kode setelah dipakai.

Kode yang dipensiunkan:

- Tetap ada di registry dengan status `deprecated`.
- Tidak boleh dipakai ulang.
- Klien lama tetap mendapat pesan yang aman sampai versi minimum dinaikkan.

## 9. Checklist

- [ ] Semua kode yang dirujuk API, UI, UAT, dan log ada di registry.
- [ ] Tidak ada kode duplikat dengan arti berbeda.
- [ ] Kode global dan modul memakai format yang benar.
- [ ] Pesan `en`/`id` paritas.
- [ ] Kode autentikasi memakai pesan generik.
- [ ] `0003` dan `0004` tidak membocorkan tenant lain.
- [ ] `0100`/`0900` memicu metrik dan alert.
- [ ] Setiap kode punya pemicu dan tes.
- [ ] Perubahan kode tercatat di UAT dan OpenAPI.

## 10. Dokumen terkait

- [Kontrak API](kontrak-api.md)
- [Spesifikasi UI](../frontend/spesifikasi-ui.md)
- [Adapter integrasi](adapter-integrasi.md)
- [Matriks izin](../../security/matriks-izin.md)
- [Alert dan eskalasi](../../operations/alert-dan-eskalasi.md)
- [Fungsi backend](../../qaqc/function/backend/README.md)
- [UAT global](../../qaqc/acceptance/README.md)
- [Glosarium](../../product/glosarium.md)
