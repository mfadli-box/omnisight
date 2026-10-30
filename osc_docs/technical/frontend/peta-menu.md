# Peta Menu Frontend

Dokumen ini menghubungkan kode modul `AA`, `AB`, dan seterusnya, rute UI, izin, dan API backend. Menu hanya tampil jika pengguna memiliki izin dan scope yang sesuai; server tetap memeriksa setiap request. Spesifikasi tampilan dan perilaku komponen ada di [spesifikasi-ui.md](spesifikasi-ui.md).

Prefix kode halaman: `CP` untuk halaman publik, `CA` untuk halaman autentikasi, dan `CG` untuk menu global. Dua digit setelah prefix adalah nomor urut.

## 1. Rute publik dan autentikasi

| Kode | Menu/Halaman | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| CP01 | Landing | `/` | Publik | `/public/pages/home` | Server-rendered |
| CP02 | Blog | `/blog` | Publik | `/public/articles` | Hanya artikel published |
| CP03 | Detail blog | `/blog/[slug]` | Publik | `/public/articles/{slug}` | Sanitasi HTML |
| CP04 | Status layanan | `/status` | Publik | `GET /public/status` (ringkas) | Tanpa detail internal |
| CP05 | Kebijakan privasi | `/legal/privacy` | Publik | `/public/pages/privacy` | Halaman statis |
| CA01 | Login lokal | `/login` | Tanpa sesi | `POST /auth/login` | Pesan generik |
| CA02 | Login HRIS | `/login/hris` | Tanpa sesi | `POST /auth/login/hris` | Pilih perusahaan |
| CA03 | MFA | `/mfa` | Sesi setengah | `POST /auth/mfa/verify` | Jika diaktifkan |
| CA04 | Pilih perusahaan | `/select-company` | Sesi | `POST /auth/context` | Jika membership > 1 |
| CA05 | Akses ditolak | `/access-denied` | Sesi | - | Bukan halaman 403 |
| CA06 | Tidak ditemukan | `/not-found` | - | - | Data di luar scope juga ke sini |

## 2. Global

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| CG01 | Profil | `/profile` | Sesi | `GET /auth/me` | Data pengguna |
| CG02 | Keamanan akun | `/profile/security` | Sesi | `/auth/mfa/enroll`, `/auth/mfa/verify`, `/auth/sessions` | MFA, sesi |
| CG03 | Notifikasi | `/notifications` | `AK:read` | `GET /content/notifications` | In-app |
| CG04 | Pencarian global | `/search` | Sesi | endpoint modul sesuai izin | Hasil difilter scope |
| CG05 | Bantuan | `/help` | Sesi | internal KB | Artikel published |
| CG06 | Pemilih perusahaan | Header | Sesi | `POST /auth/context` | Invalidasi cache |
| CG07 | Pemilih area | Header | Sesi | `POST /auth/context` | Hanya area di scope |
| CG08 | Banner impersonasi | Layout | Platform | `GET /auth/me` | Tidak bisa ditutup |
| CG09 | Pemilih bahasa | Header dan `/profile/preferences` | Sesi | `PATCH /auth/me` | `en`/`id`, default `en`; perbarui cookie `OSC_LOCALE` |

## 3. AA Dashboard

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AA01 | Ringkasan | `/dashboard` | `AA:read` | `GET /dashboard/summary`, `GET /dashboard/tasks` | Kartu dan tugas sesuai scope |
| AA02 | Kesehatan layanan | `/dashboard/health` | `AA:read` | `GET /dashboard/health` | Status integrasi |
| AA03 | Aktivitas terbaru | `/dashboard/activity` | `AA:read` | `GET /dashboard/activity` | Ringkas audit |

## 4. AB Identitas, Organisasi, dan Akses

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AB01 | Perusahaan dan Area | `/identity/organization` | `AB:read/post` | `/identity/companies`, `/identity/areas` | Tab; buat perusahaan hanya platform |
| AB02 | Pengguna dan Undangan | `/identity/users` | `AB02:read/post` | `/identity/users`, `/identity/memberships` | Undangan, status |
| AB03 | Peran dan Izin | `/identity/roles` | `AB03:read/post` | `/identity/roles` | Matriks read/post |
| AB04 | Login HRIS | `/identity/hris` | `AB04:read/post` | `/identity/hris/connections`, `/rules`, `/test` | Koneksi + aturan |
| AB05 | Sesi dan Perangkat | `/identity/sessions` | `AB05:read/post` | `/auth/sessions` | Cabut sesi |
| AB06 | Riwayat Login | `/identity/login-history` | `AB06:read` | `/identity/login-attempts` | Sukses/gagal |
| AB07 | Direktori | `/identity/directory` | `AB:read` | `/identity/directory` | Hanya scope |

Layar kunci:

- Form aturan HRIS dengan editor JSON tervalidasi.
- Tombol "Test koneksi" memakai endpoint test, bukan menyimpan rahasia di browser.
- Detail pengguna menampilkan membership, role, scope, sesi, dan audit terkait.
- Perubahan role memerlukan alasan dan dicatat.

## 5. AC Manajemen Aset

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AC01 | Kategori dan Model | `/assets/catalog` | `AC:read/post` | `/assets/categories`, `/assets/models` | Tab |
| AC02 | Aset Fisik | `/assets/items` | `AC:read/post` | `/assets/assets` | Tabel cursor |
| AC03 | Lokasi dan Penempatan | `/assets/placements` | `AC:read/post` | `/assets/assets?location_id=` | Peta/lokasi |
| AC04 | Check-out / Check-in | `/assets/assignments` | `AC:read/post` | `/assets/assets/{id}/checkout`, `/checkin` | Riwayat |
| AC05 | Mutasi dan Riwayat | `/assets/movements` | `AC:read` | `/assets/assets/{id}/history` | Timeline |
| AC06 | Label dan QR | `/assets/labels` | `AC:read/post` | `/assets/assets/{id}/qr/rotate` | Cetak massal |
| AC07 | Laporan Aset | `/assets/reports` | `AC:read` | `/assets/reports` | Ekspor aman |

Layar kunci:

- Detail aset: status, lokasi, penanggung jawab, garansi, lampiran, riwayat.
- Check-out memilih anggota perusahaan dan area yang sama.
- Aset `lost/disposed` memerlukan konfirmasi dan alasan.
- QR publik tidak menampilkan data sensitif.

## 6. AD Jaringan dan IPAM

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AD01 | Site, Rack, Lokasi | `/network/sites` | `AD:read/post` | `/network/racks`, lokasi terkait | Denah/rack |
| AD02 | Perangkat Jaringan | `/network/devices` | `AD:read/post` | `/network/devices`, `/interfaces` | Inventaris |
| AD03 | IPAM dan VLAN | `/network/ipam` | `AD:read/post` | `/network/prefixes`, `/ip-addresses`, `/vlans` | Alokasi |
| AD04 | Topologi dan Koneksi | `/network/topology` | `AD:read` | `/network/links`, `/circuits` | Graf |
| AD05 | Router MikroTik | `/network/routers` | `AD:read/post` | `/network/routers` | Health |
| AD06 | Firewall dan Aturan | `/network/firewall` | `AD06:read/post` | `/network/changes`, `/approve`, `/execute`, `/rollback` | Approval |
| AD07 | Maintenance RouterOS | `/network/maintenance` | `AD07:read/post` | `/network/routers/{id}/snapshot` | Snapshot |
| AD08 | Integrasi NetBox/LibreNMS | `/network/integrations` | `AD:read/post` | `/network/integrations`, `/{id}/sync` | Sync review |

Layar kunci:

- Firewall: tampilan before/after, risiko, approval, rollback.
- Tombol eksekusi nonaktif sampai disetujui.
- Konflik sinkronisasi masuk antrean review, tidak ditimpa otomatis.
- Kredensial perangkat tidak pernah ditampilkan.

## 7. AE Monitoring

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AE01 | Host dan Agent | `/monitoring/hosts` | `AE:read` | `/monitoring/hosts`, `/monitoring/agents` | Heartbeat |
| AE02 | Metrik dan Grafik | `/monitoring/metrics` | `AE:read` | `/monitoring/agents/{id}/metrics` | uPlot |
| AE03 | Alert dan Ambang | `/monitoring/alerts` | `AE:read/post` | `/monitoring/alert-rules`, `/alerts` | Ack |
| AE04 | Insiden | `/monitoring/incidents` | `AE:read/post` | `/monitoring/incidents` | Timeline |
| AE05 | Integrasi LibreNMS | `/monitoring/librenms` | `AE:read/post` | `/monitoring/integrations`, `/{id}/sync` | Sync |
| AE06 | Integrasi Wazuh | `/monitoring/wazuh` | `AE06:read/post` | `/monitoring/security-events`, `/{id}/triage` | Active response approval |
| AE07 | Retensi Metrik | `/monitoring/retention` | `AE:read/post` | `/monitoring/retention` | Kebijakan |

Layar kunci:

- Grafik memakai resolusi adaptif; data mentah tidak dimuat semua.
- Alert menampilkan fingerprint, rule, host, dan aksi.
- Maintenance window menghindari alert palsu.
- Data sumber (OmniSight/Beszel/LibreNMS) diberi label jelas.

## 8. AF Container

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AF01 | Endpoint | `/containers/endpoints` | `AF:read/post` | `/containers/endpoints` | Docker/Podman |
| AF02 | Stack dan Compose | `/containers/stacks` | `AF:read/post` | `/containers/stacks` | Validasi |
| AF03 | Layanan dan Container | `/containers/services` | `AF:read` | `GET /containers/stacks/{id}` | Status |
| AF04 | Deploy dan Rollback | `/containers/deployments` | `AF04:read/post` | `/containers/stacks/{id}/plan`, `/deploy`, `/rollback`, `/containers/actions/{id}/approve` | Approval |
| AF05 | Maintenance | `/containers/maintenance` | `AF05:read/post` | `/containers/actions` (GET/POST) | Start/stop/restart |
| AF06 | Gambaran Host | `/containers/host` | `AF:read` | `/containers/hosts` | Disk/image/volume |

Layar kunci:

- Plan deploy menampilkan diff, image digest, resource limit, dan risiko.
- Tombol deploy produksi memerlukan approval.
- Log ditampilkan streaming dengan redaksi.
- Rollback memilih revisi sebelumnya.

## 9. AG Edge

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AG01 | Domain | `/edge/domains` | `AG:read/post` | `/edge/domains` | Expiry |
| AG02 | Sertifikat | `/edge/certificates` | `AG:read/post` | `/edge/certificates` | Auto-renew |
| AG03 | Proxy Host | `/edge/proxies` | `AG:read/post` | `/edge/proxy-hosts` | Upstream |
| AG04 | Konfigurasi Nginx | `/edge/nginx` | `AG04:read/post` | `/edge/proxy-hosts/{id}/apply` | Template + validasi |
| AG05 | Edge Node | `/edge/nodes` | `AG:read/post` | `/edge/nodes` | Agent edge |

Layar kunci:

- Tidak ada editor config bebas.
- Preview config dan hasil `nginx -t`.
- Apply memerlukan konfirmasi; gagal reload memicu rollback.
- Private key tidak pernah ditampilkan.

## 10. AH Backup

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AH01 | Sumber Konfigurasi | `/backups/sources` | `AH:read/post` | `/backups/sources` | Router/edge |
| AH02 | Jadwal Backup | `/backups/schedules` | `AH:read/post` | `/backups/schedules` | Cron |
| AH03 | Snapshot dan Diff | `/backups/snapshots` | `AH:read` | `/backups/backups`, `/{id}/diff` | Timeline |
| AH04 | Restore | `/backups/restores` | `AH04:read/post` | `/backups/backups/{id}/restore`, `/restores/{id}/approve` | Approval |
| AH05 | Verifikasi | `/backups/verification` | `AH05:read/post` | `/backups/verifications`, `/backups/backups/{id}/verify` | Uji restore |

Layar kunci:

- Diff dengan batas ukuran dan redaksi.
- Restore menampilkan dampak, target, dan snapshot sebelum restore.
- Snapshot tidak dapat dihapus dari UI.

## 11. AI Akses Aman

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AI01 | Target Akses | `/access/targets` | `AI:read/post` | `/access/targets` | JumpServer ref |
| AI02 | Permintaan Akses | `/access/requests` | `AI02:read/post` | `/access/requests`, `/approve`, `/access/requests/mine` | Requester memakai `AI:post` scope self |
| AI03 | Sesi Aktif | `/access/sessions` | `AI:read/post` | `/access/sessions`, `/terminate` | Cabut |
| AI04 | Rekaman dan Audit | `/access/recordings` | `AI:read` | `/access/sessions` | Akses diaudit |
| AI05 | Kebijakan Akses | `/access/policies` | `AI05:read/post` | `/access/policies` | MFA/durasi |

Catatan: `requester` membuat permintaan dengan `AI:post` scope self; daftar approval memakai `AI02:read` dan aksi setuju memakai `AI02:post`. Menu permintaan tampil jika pengguna memiliki salah satu izin tersebut.

## 12. AJ Layanan

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AJ01 | Tiket | `/service-desk/tickets` | `AJ:read/post` | `/service-desk/tickets`, `/comments`, `/tickets/mine` | Requester memakai scope self |
| AJ02 | Kategori dan SLA | `/service-desk/sla` | `AJ:read/post` | `/service-desk/categories`, `/sla-policies` | Kalender |
| AJ03 | Kontrak dan Vendor | `/service-desk/contracts` | `AJ:read/post` | `/service-desk/contracts` | Renewal |
| AJ04 | Knowledge Base | `/service-desk/knowledge` | `AJ:read/post` | `/service-desk/kb` | Publik/internal |
| AJ05 | Laporan Layanan | `/service-desk/reports` | `AJ:read` | `/service-desk/reports` | SLA |

## 13. AK Konten

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AK01 | Artikel dan Halaman | `/content/articles` | `AK:read/post` | `/content/articles`, `/pages` | Editor |
| AK02 | Blog dan Pengumuman | `/content/blog` | `AK:read/post` | `/content/articles?visibility=public` | Publikasi |
| AK03 | Template Notifikasi | `/content/templates` | `AK:read/post` | `/content/notification-templates` | Variabel |
| AK04 | Kirim dan Riwayat | `/content/deliveries` | `AK:read` | `/content/notifications` | Retry |
| AK05 | Preferensi Pengguna | `/content/preferences` | `AK:read/post` | `GET/PATCH /content/preferences` | Kanal |

## 14. AL Audit dan Keamanan

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AL01 | Audit Trail | `/audit/events` | `AL:read` | `/audit/events` | Filter |
| AL02 | Login dan Akses | `/audit/logins` | `AL:read` | `/audit/logins`, `/audit/events` | Denial |
| AL03 | Kejadian Keamanan | `/audit/security` | `AL:read/post` | `/audit/security-events` | Wazuh |
| AL04 | Review Akses | `/audit/reviews` | `AL04:read/post` | `/audit/access-reviews` | Kampanye |
| AL05 | Ekspor dan Retensi | `/audit/export` | `AL05:read/post` | `/audit/export`, `/audit/retention` | Ekspor aman |

Layar kunci:

- Diff before/after dengan field sensitif diredaksi.
- Tautan request id ke log internal (jika pengguna berhak).
- Ekspor memerlukan alasan dan approval.
- Review akses menampilkan role, scope, dan keputusan.

## 15. AM Pengaturan Platform

| Kode | Menu | Rute | Izin | API | Catatan |
|---|---|---|---|---|---|
| AM01 | Integrasi dan Adapter | `/settings/integrations` | `AM:read/post` | `/platform/integrations`, `/test`, `/platform/health` | Health |
| AM02 | Kredensial dan Vault | `/settings/credentials` | `AM02:read/post` | `/platform/credentials` | Write-only |
| AM03 | Webhook dan API Key | `/settings/webhooks` | `AM03:read/post` | `/platform/webhooks`, `/api-keys` | Scope |
| AM04 | Scheduler | `/settings/scheduler` | `AM:read/post` | `/platform/jobs` | Retry |
| AM05 | Pengaturan Platform | `/settings/platform` | `AM:read/post` | `/platform/settings` | Retensi, locale default perusahaan |
| AM06 | Feature Flag | `/settings/features` | `AM:read/post` | `/platform/feature-flags` | Per perusahaan |
| AM07 | Branding dan Tema | `/settings/branding` | `AM:read/post` | `/platform/settings` | Logo, warna |
| AM08 | Impersonasi dan Dukungan | `/settings/impersonation` | `AM08:read/post` | `/platform/impersonation`, `/{id}/end` | Platform owner; banner wajib |

Layar kunci:

- Kredensial hanya bisa ditulis/diuji; tidak pernah ditampilkan kembali.
- API key ditampilkan sekali saat dibuat.
- Impersonasi hanya untuk `platform_owner`, memakai alasan, batas waktu, MFA ulang, dan banner yang tidak dapat ditutup.
- Webhook memiliki secret dan daftar event.
- Feature flag memiliki audit perubahan.

## 16. Aturan visibilitas menu

1. Menu tampil jika `permission` ada.
2. Menu dengan data area hanya tampil jika area scope tersedia.
3. Platform settings hanya untuk Platform Owner/Company Admin sesuai izin.
4. Menu self-service seperti permintaan akses sendiri dan preferensi notifikasi tampil untuk pengguna terautentikasi; server tetap memfilter data milik pengguna.
5. Auditor hanya melihat menu read.
6. Requester hanya melihat tiket, permintaan akses, dan artikel.
7. Menu yang tidak tersedia tidak boleh diakses lewat URL langsung; server menolak dengan kode `AA00-00-0003`.
8. Halaman `/access-denied` tidak memakai status 403.
9. Bahasa tidak mengubah izin: rute dan menu tetap mengikuti izin dan scope, bukan pilihan bahasa.
10. Default bahasa Inggris; pengguna dapat memilih Indonesia dari header atau halaman preferensi profil.
11. Perubahan bahasa tidak memuat ulang data lintas tenant; hanya memperbarui label dan pesan.
