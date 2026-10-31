# Matriks Izin

Status: Disetujui (0.6)

Dokumen ini adalah acuan tunggal untuk kode izin, peran bawaan, scope data, dan kontrol aksi sensitif. Jika ringkasan di dokumen lain berbeda, matriks ini yang berlaku.

## 1. Hubungan dengan dokumen lain

| Dokumen | Peran |
|---|---|
| [Peta modul](../product/peta-modul.md) | Kode modul/submodul, menu, path API, dan rute UI |
| [Topologi dan akses](../technical/backend/topologi-dan-akses.md) | Zona akses, urutan evaluasi otorisasi, aturan penolakan |
| [Skema inti](../technical/database/skema-inti.md) | Tabel `core.permissions`, `core.roles`, `core.membership_roles`, `core.user_platform_roles` |
| [Kontrak API](../technical/backend/kontrak-api.md) | Envelope, kode error, izin per endpoint |
| [UAT dan penerimaan](../qaqc/acceptance/README.md) | Skenario uji izin, scope, approval, dan audit |
| [Keamanan](README.md) | Threat model dan kebijakan keamanan |

Perubahan kode izin atau grant bawaan wajib melewati review pemilik keamanan dan pemilik modul.

## 2. Model izin

| Aturan | Penjelasan |
|---|---|
| Format kode | `<modul>:<aksi>` atau `<submodul>:<aksi>` |
| Aksi | Hanya `read` dan `post` |
| Arti `post` | Membuat, mengubah, menghapus, atau menjalankan aksi; mencakup `read` pada cakupan yang sama |
| Submodul biasa | Memakai izin modul, misalnya `AC02` memakai `AC:read` dan `AC:post` |
| Submodul sensitif | Memakai izin submodul, misalnya `AD06:read/post`; izin modul tidak cukup |
| Pemberian | Role → membership (`company` atau `area`) → pengguna |
| Peran platform | Melekat pada pengguna, terpisah dari membership perusahaan |
| JWT | Tidak memuat daftar izin lengkap; server membaca cache pendek dan menginvalidasi saat role berubah |
| Frontend | Menu dan tombol mengikuti izin; server tetap memeriksa setiap request |

Contoh:

- Mengubah firewall: `AD06:post`, bukan cukup `AD:post`.
- Menyetujui restore: `AH04:post`.
- Membaca audit: `AL:read`; mengekspor audit: `AL05:post`.

`post` mencakup `read` agar role tidak perlu dua izin untuk menu yang sama. Izin submodul sensitif menggantikan izin modul untuk submodul tersebut, sesuai tabel di [peta menu](../technical/frontend/peta-menu.md).

## 3. Scope data

| Scope | Arti | Contoh |
|---|---|---|
| `global` | Lintas perusahaan; hanya peran platform | Membuat perusahaan, feature flag platform |
| `company` | Semua area dalam perusahaan aktif | Pengaturan platform perusahaan, audit |
| `area` | Area yang diberikan dan seluruh turunannya (`core.areas.path`) | Aset, perangkat, tiket, deploy |
| `self` | Hanya data yang terhubung langsung ke pengguna | Profil, sesi sendiri, aset yang ditugaskan |

Aturan:

- Izin tanpa scope yang cocok selalu ditolak, walaupun kode izinnya benar.
- Area induk tidak otomatis memberi akses ke area saudara.
- Resource di luar scope diperlakukan sebagai tidak ditemukan (`AA00-00-0004`), bukan akses ditolak (`AA00-00-0003`).
- Tenant aktif ditentukan server dari sesi dan route; `company_id` di body tidak dipercaya.
- Scope area disimpan di `core.membership_roles.scope_type` dan `scope_id`.

## 4. Peran platform

Pemberian peran platform disimpan di `core.user_platform_roles` dan tidak memberi akses data bisnis secara otomatis. Definisi nama, izin, dan batas peran berada di `permissions.json`; seed WP-02 menyimpan salinan sementara di `platform.settings` sampai ADR-017 diputuskan.

| Kode | Nama | Scope | Izin utama | Batas |
|---|---|---|---|---|
| `platform_owner` | Platform Owner | global | `AM:read/post`, `AB:post`, `AM08:read/post` | Tidak membaca data bisnis tanpa impersonasi |
| `platform_support` | Platform Support | global | `AA:read`, `AL:read`, `AM:read` | Tidak mengubah data perusahaan |
| `platform_security` | Platform Security | global | `AL:read`, `AL04:post`, `AL05:post`, `AM:read` | Tidak mengubah konfigurasi bisnis |

Aturan:

- Semua peran platform wajib MFA aktif.
- `platform_owner` membuat perusahaan dan admin pertama; setelah itu pengelolaan anggota dilakukan di perusahaan.
- `AB:post` global pada `platform_owner` hanya berlaku untuk endpoint siklus hidup perusahaan dan admin pertama; endpoint AB lain tetap memerlukan membership perusahaan.
- Minimal satu `platform_owner` aktif harus selalu ada.
- Pemberian dan pencabutan peran platform dicatat di audit.
- Impersonasi diatur di bagian 9 dan wajib memakai `AM08:post`.

## 5. Peran perusahaan

Tabel ini adalah grant bawaan untuk role sistem. `post` mencakup `read`; `*` berarti aksi sensitif tetap memerlukan approval sesuai bagian 6.

| Modul | company_admin | area_manager | noc_operator | field_technician | viewer | auditor | requester |
|---|---|---|---|---|---|---|---|
| AA Dashboard | read | read | read | read | read | read | read (self) |
| AB Identitas | post | read | read | read | read | read | - |
| AC Aset | post | post | read | post | read | read | - |
| AD Jaringan | post | post | post* | read | read | read | - |
| AE Monitoring | post | post | post | read | read | read | - |
| AF Container | post | post* | post* | read | read | read | - |
| AG Edge | post | post* | read | - | read | read | - |
| AH Backup | post | read | read | - | read | read | - |
| AI Akses Aman | post | post | read | - | - | read | post (self) |
| AJ Layanan | post | post | post | post | read | read | post (self) |
| AK Konten | post | read | read | read | read | read | read |
| AL Audit | read | read | read | - | - | read | - |
| AM Platform | post | - | - | - | - | read | - |

Catatan per peran:

- `company_admin`: semua modul perusahaan; tidak dapat menyetujui permintaannya sendiri; tidak dapat menghapus admin terakhir; tidak memiliki data platform global.
- `area_manager`: hanya area dan turunannya; dapat menyetujui aksi sensitif di area; tidak dapat mengelola role, HRIS, atau kredensial.
- `noc_operator`: monitoring, jaringan, dan container; boleh merencanakan dan mengeksekusi setelah approval; tidak boleh menyetujui permintaan sendiri.
- `field_technician`: aset dan tiket di area; check-out/in; tanpa ekspor massal atau audit.
- `viewer`: hanya baca; tidak melihat audit kecuali diberi `AL:read` eksplisit.
- `auditor`: baca audit, review akses, ekspor audit; tidak menulis data bisnis.
- `requester`: hanya self-service; tiket sendiri, permintaan akses sendiri, aset yang ditugaskan, dan artikel yang terbit. Tidak dapat menelusuri direktori atau aset bersama.

## 6. Izin submodul sensitif

Kode submodul dipakai untuk aksi berisiko tinggi. Izin modul tidak cukup untuk submodul di tabel ini.

| Kode | company_admin | area_manager | noc_operator | field_technician | viewer | auditor | requester | Tingkat | Approval |
|---|---|---|---|---|---|---|---|---|---|
| `AB02:read/post` | ya | - | - | - | - | - | - | Tinggi | Tidak |
| `AB03:read/post` | ya | - | - | - | - | - | - | Tinggi | Tidak |
| `AB04:read/post` | ya | - | - | - | - | - | - | Kritis | Ya |
| `AB05:read/post` | ya | - | - | - | - | - | - | Tinggi | Tidak |
| `AB06:read` | ya | - | - | - | - | ya | - | Tinggi | Tidak |
| `AD06:read/post` | ya | ya | ya | - | - | - | - | Kritis | Ya |
| `AD07:read/post` | ya | ya | ya | - | - | - | - | Kritis | Ya |
| `AE06:read/post` | ya | - | ya | - | - | - | - | Kritis | Ya |
| `AF04:read/post` | ya | ya | ya | - | - | - | - | Kritis | Ya |
| `AF05:read/post` | ya | ya | ya | - | - | - | - | Tinggi | Kebijakan |
| `AG04:read/post` | ya | ya | - | - | - | - | - | Kritis | Ya |
| `AH04:read/post` | ya | - | - | - | - | - | - | Kritis | Ya, dual control |
| `AH05:read/post` | ya | - | - | - | - | - | - | Tinggi | Ya |
| `AI02:read/post` | ya | ya | - | - | - | - | - | Tinggi | Tidak |
| `AI05:read/post` | ya | - | - | - | - | - | - | Tinggi | Tidak |
| `AL04:read/post` | ya | - | - | - | - | ya | - | Tinggi | Tidak |
| `AL05:read/post` | ya | - | - | - | - | ya | - | Kritis | Ya |
| `AM02:read/post` | ya | - | - | - | - | - | - | Kritis | Ya |
| `AM03:read/post` | ya | - | - | - | - | - | - | Tinggi | Tidak |
| `AM08:read/post` | - | - | - | - | - | - | - | Kritis | Ya, platform only |

Aturan approval:

- Approver harus pengguna lain dengan izin submodul yang sama; self-approval selalu ditolak.
- Approval berlaku maksimal 24 jam atau lebih pendek sesuai kebijakan modul.
- Aksi kritis memerlukan MFA ulang paling lama 15 menit sebelum eksekusi.
- Alasan wajib diisi untuk semua aksi Tinggi dan Kritis.
- `AH04` memakai dual control: pemohon dan approver berbeda, keduanya memegang `AH04:post`.
- `AM08` hanya untuk `platform_owner`; `platform_security` boleh membaca riwayat, tidak boleh memulai sesi.
- `platform_security` memegang `AL04:post` dan `AL05:post` dengan scope global.

## 7. Katalog izin per submodul

`post` mencakup `read`. Kolom kontrol tambahan hanya menyebut kontrol di luar audit standar.

| Kode | Menu | Izin | Scope | Sensitivitas | Kontrol tambahan |
|---|---|---|---|---|---|
| AA01 | Ringkasan | `AA:read` | sesuai scope pengguna | Normal | - |
| AA02 | Kesehatan Layanan | `AA:read` | company/global | Normal | Data komponen tanpa hostname internal |
| AA03 | Aktivitas Terbaru | `AA:read` | company/area | Normal | Filter audit sesuai izin |
| AB01 | Perusahaan dan Area | `AB:read/post` | global/company | Normal | - |
| AB02 | Pengguna dan Undangan | `AB02:read/post` | company | Tinggi | MFA ulang, alasan |
| AB03 | Peran dan Izin | `AB03:read/post` | company | Tinggi | MFA ulang, cegah admin terakhir |
| AB04 | Login HRIS | `AB04:read/post` | company | Kritis | MFA ulang, approval |
| AB05 | Sesi dan Perangkat | `AB05:read/post` | company/self | Tinggi | MFA ulang; sesi sendiri lewat self-service |
| AB06 | Riwayat Login | `AB06:read` | company | Tinggi | Data identifier disamarkan |
| AB07 | Direktori | `AB:read` | company/area | Normal | - |
| AC01 | Kategori dan Model | `AC:read/post` | company/area | Normal | - |
| AC02 | Aset Fisik | `AC:read/post` | area | Normal | - |
| AC03 | Lokasi dan Penempatan | `AC:read/post` | area | Normal | Foreign key komposit |
| AC04 | Check-out / Check-in | `AC:read/post` | area | Normal | - |
| AC05 | Mutasi dan Riwayat | `AC:read` | area | Normal | Riwayat tidak dapat dihapus |
| AC06 | Label dan QR | `AC:read/post` | area | Normal | Token QR tidak memuat data sensitif |
| AC07 | Laporan Aset | `AC:read` | company/area | Normal | Ekspor diaudit |
| AD01 | Site, Rack, dan Lokasi | `AD:read/post` | area | Normal | - |
| AD02 | Perangkat Jaringan | `AD:read/post` | area | Normal | - |
| AD03 | IPAM dan VLAN | `AD:read/post` | area | Normal | Cek konflik alokasi |
| AD04 | Topologi dan Koneksi | `AD:read` | area | Normal | - |
| AD05 | Router MikroTik | `AD:read/post` | area | Tinggi | Kredensial lewat vault |
| AD06 | Firewall dan Aturan | `AD06:read/post` | area | Kritis | Approval, snapshot, rollback |
| AD07 | Maintenance RouterOS | `AD07:read/post` | area | Kritis | Approval, snapshot |
| AD08 | Integrasi NetBox/LibreNMS | `AD:read/post` | company | Normal | Sinkronisasi idempotent |
| AE01 | Host dan Agent | `AE:read` | area | Normal | - |
| AE02 | Metrik dan Grafik | `AE:read` | area | Normal | - |
| AE03 | Alert dan Ambang Batas | `AE:read/post` | area | Normal | - |
| AE04 | Insiden | `AE:read/post` | area | Normal | - |
| AE05 | Integrasi LibreNMS | `AE:read/post` | company | Normal | - |
| AE06 | Integrasi Wazuh | `AE06:read/post` | company | Kritis | Approval untuk active response |
| AE07 | Retensi Metrik | `AE:read/post` | company | Normal | - |
| AF01 | Endpoint | `AF:read/post` | area | Tinggi | TLS dan socket proxy |
| AF02 | Stack dan Compose | `AF:read/post` | area | Normal | Validasi compose dan digest |
| AF03 | Layanan dan Container | `AF:read` | area | Normal | - |
| AF04 | Deploy dan Rollback | `AF04:read/post` | area | Kritis | Approval, health check, rollback |
| AF05 | Maintenance | `AF05:read/post` | area | Tinggi | Approval sesuai lingkungan |
| AF06 | Gambaran Host | `AF:read` | area | Normal | - |
| AG01 | Domain | `AG:read/post` | company | Normal | - |
| AG02 | Sertifikat | `AG:read/post` | company | Tinggi | Private key di vault |
| AG03 | Proxy Host | `AG:read/post` | company | Normal | - |
| AG04 | Konfigurasi Nginx | `AG04:read/post` | company/area | Kritis | Approval, `nginx -t`, rollback |
| AG05 | Edge Node | `AG:read/post` | company | Normal | - |
| AH01 | Sumber Konfigurasi | `AH:read/post` | company/area | Normal | - |
| AH02 | Jadwal Backup | `AH:read/post` | company/area | Normal | - |
| AH03 | Snapshot dan Diff | `AH:read` | company/area | Tinggi | Enkripsi; unduh diaudit |
| AH04 | Restore | `AH04:read/post` | company/area | Kritis | Approval dan dual control |
| AH05 | Verifikasi | `AH05:read/post` | company | Tinggi | Approval, lingkungan terisolasi |
| AI01 | Target Akses | `AI:read/post` | company/area | Tinggi | Kredensial lewat vault |
| AI02 | Permintaan Akses | `AI:post` (request self); `AI02:read/post` (approve) | self/area | Tinggi | Request self-service; approval manager |
| AI03 | Sesi Aktif | `AI:read/post` | area | Tinggi | Pencabutan segera |
| AI04 | Rekaman dan Audit | `AI:read` | company | Tinggi | Metadata; tautan rekaman diaudit |
| AI05 | Kebijakan Akses | `AI05:read/post` | company | Tinggi | MFA ulang |
| AJ01 | Tiket | `AJ:read/post` | self/area | Normal | - |
| AJ02 | Kategori dan SLA | `AJ:read/post` | company | Normal | - |
| AJ03 | Kontrak dan Vendor | `AJ:read/post` | company | Tinggi | Dokumen dengan akses terbatas |
| AJ04 | Knowledge Base | `AJ:read/post` | company/public | Normal | Sanitasi HTML |
| AJ05 | Laporan Layanan | `AJ:read` | company/area | Normal | - |
| AK01 | Artikel dan Halaman | `AK:read/post` | company/public | Normal | Sanitasi HTML |
| AK02 | Blog dan Pengumuman | `AK:read/post` | company/public | Normal | - |
| AK03 | Template Notifikasi | `AK:read/post` | company | Normal | Validasi variabel |
| AK04 | Kirim dan Riwayat | `AK:read` | company | Normal | - |
| AK05 | Preferensi Pengguna | `AK:read/post` | self | Normal | Self-service |
| AL01 | Audit Trail | `AL:read` | company | Tinggi | Redaksi payload |
| AL02 | Login dan Akses | `AL:read` | company | Tinggi | Identifier disamarkan |
| AL03 | Kejadian Keamanan | `AL:read/post` | company | Tinggi | Triase dan audit |
| AL04 | Review Akses | `AL04:read/post` | company | Tinggi | Reviewer bukan target review |
| AL05 | Ekspor dan Retensi | `AL05:read/post` | company | Kritis | Approval, watermark, audit ekspor |
| AM01 | Integrasi dan Adapter | `AM:read/post` | company | Tinggi | Rahasia sebagai referensi vault |
| AM02 | Kredensial dan Vault | `AM02:read/post` | company | Kritis | Approval; nilai rahasia tidak pernah dibaca |
| AM03 | Webhook dan API Key | `AM03:read/post` | company | Tinggi | Kunci ditampilkan sekali, expiry |
| AM04 | Scheduler | `AM:read/post` | company | Normal | - |
| AM05 | Pengaturan Platform | `AM:read/post` | company | Normal | - |
| AM06 | Feature Flag | `AM:read/post` | company | Normal | - |
| AM07 | Branding dan Tema | `AM:read/post` | company | Normal | Validasi unggahan |
| AM08 | Impersonasi dan Dukungan | `AM08:read/post` | global | Kritis | Platform only, MFA, alasan, batas waktu, banner |

## 8. Aksi khusus dan self-service

Endpoint berikut tidak memerlukan izin modul, tetapi tetap memerlukan sesi aktif dan hanya berlaku untuk data pengguna sendiri.

| Endpoint | Kemampuan | Batas |
|---|---|---|
| `GET/PATCH /auth/me` | Profil dan locale sendiri | Tidak dapat mengubah email, peran, atau status |
| `GET /auth/sessions` | Daftar sesi sendiri | Hanya sesi milik pengguna |
| `POST /auth/sessions/{id}/revoke` | Cabut sesi sendiri | Sesi milik pengguna |
| `POST /auth/mfa/*` | Enroll dan verifikasi MFA | Hanya akun sendiri |
| `GET /assets/mine` | Aset yang ditugaskan | Tanpa `AC:read`; hanya aset terkait |
| `PATCH /content/preferences` | Preferensi notifikasi | Hanya preferensi sendiri |
| `GET /service-desk/tickets/mine` | Tiket sendiri | Memakai `AJ:read` scope self |
| `GET /access/requests/mine` | Permintaan akses sendiri | Memakai `AI:post` scope self |

Aturan:

- Endpoint self-service tidak menerima `user_id` dari klien; identitas diambil dari sesi.
- Admin yang mengelola sesi pengguna lain tetap memerlukan `AB05:post`.
- Self-service tidak boleh dipakai untuk membaca data bersama, direktori, atau aset yang tidak ditugaskan.

## 9. Impersonasi

- Hanya `platform_owner` dengan `AM08:post`.
- Wajib alasan, referensi tiket opsional, MFA ulang paling lama 5 menit, dan batas waktu maksimal 60 menit.
- Banner impersonasi selalu terlihat dan tidak dapat ditutup.
- Tidak dapat mengubah role, kredensial, izin, atau menghapus data.
- Aksi sensitif selama impersonasi tetap memerlukan approval pengguna lain; impersonator tidak dihitung sebagai approver.
- Sesi berakhir otomatis saat batas waktu, logout, atau pencabutan.
- Semua aksi dicatat dengan `actor_type`, impersonator, target, alasan, dan `request_id`.
- `platform_security` boleh membaca riwayat, tidak boleh memulai sesi.

## 10. Penolakan dan pencatatan

- Akses ditolak mengembalikan HTTP 200 dengan envelope `AA00-00-0003`.
- Resource di luar scope mengembalikan `AA00-00-0004` agar keberadaannya tidak bocor.
- Pesan diterjemahkan sesuai locale; kode tidak berubah.
- Setiap penolakan dicatat di audit dan metrik `authz_denied_total{module,reason}`.
- Lonjakan penolakan memicu alert keamanan dan rate limit tambahan.
- Tidak ada HTTP 403 dan tidak ada 5xx ke klien; health internal tetap memakai status nyata.

## 11. Seed, perubahan, dan pengujian

- `core.permissions` di-seed idempotent; setiap kode submodul sensitif memiliki `is_sensitive=true`.
- Template role perusahaan memuat grant bawaan sesuai bagian 5 dan 6.
- Menambah submodul berarti menambah baris katalog, seed, dan skenario UAT.
- Mengubah atau mencabut izin memerlukan migrasi, laporan dampak role, dan audit.
- Perubahan role atau membership berlaku pada request berikutnya; cache izin maksimal 30 detik.
- Pengujian wajib mencakup: positif per peran, negatif per peran, lintas tenant, scope area, approval, self-approval, dan self-service.

## 12. Checklist

- [ ] Setiap submodul `AA01` sampai `AM08` memiliki baris katalog.
- [ ] Setiap aksi sensitif memakai kode submodul.
- [ ] Grant bawaan cocok dengan tabel peran.
- [ ] `requester` tidak dapat membaca data bersama.
- [ ] Self-service tidak menerima `user_id` dari klien.
- [ ] Approval tidak dapat dilakukan sendiri.
- [ ] Lintas tenant dan area saudara diuji.
- [ ] Penolakan memakai `AA00-00-0003` dan tercatat.
- [ ] Seed idempotent dan tidak memuat rahasia.
- [ ] Matriks diperbarui saat menambah submodul atau aksi.
