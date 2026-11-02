# Rencana Implementasi

Status: Disetujui (0.6)

Dokumen ini menerjemahkan dokumentasi yang disetujui menjadi urutan pekerjaan. Isinya adalah **urutan dan gerbang**, bukan janji tanggal. Setiap work package (WP) menghasilkan irisan vertikal yang dapat diuji, bukan lapisan setengah jadi.

Dokumentasi 0.6 disetujui pada **2026-10-30 (G0)**. Rencana ini berlaku dan implementasi dimulai dari WP-01.

## 1. Prinsip

1. **Skema dan isolasi lebih dulu**: tidak ada modul sebelum tenant, RLS, dan audit dasar terbukti.
2. **Irisan vertikal**: setiap WP menyentuh database, backend, frontend, tes, dan dokumentasi untuk satu alur.
3. **Tes menyertai kode**: unit, integration, dan UAT subset diselesaikan dalam WP yang sama.
4. **Dokumentasi berubah bersama kode**: kontrak API, kode error, menu, izin, dan UAT diperbarui dalam PR yang sama.
5. **Keamanan bukan tahap akhir**: setiap WP melewati review keamanan untuk permukaan barunya.
6. **Tidak ada rahasia di repositori**: contoh memakai placeholder; secret disuntik saat deploy.
7. **Satu sumber kebenaran**: `osc_rest` menulis data domain; modul lain memakai API.
8. **Dapat dioperasikan sejak awal**: health, metrik, log, alert, dan backup tersedia sebelum rilis.

## 2. Work package

| WP | Hasil | Bergantung pada | Dokumen acuan |
|---|---|---|---|
| WP-01 | Fondasi repo, CI, compose dev, validator dokumen | G0 disetujui (2026-10-30) | [CI/CD](../operations/ci-cd.md), [operasi](../operations/README.md) |
| WP-02 | Skema inti, migrasi, RLS, seed, tes isolasi | WP-01 | [skema inti](../technical/database/skema-inti.md), [Prisma](../technical/database/prisma-dan-migrasi.md) |
| WP-03 | Login lokal, sesi, MFA, CSRF, audit, registry error | WP-02 | [kontrak API](../technical/backend/kontrak-api.md), [kode error](../technical/backend/kode-error.md) |
| WP-04 | Adapter HRIS, aturan sukses/gagal, lokalisasi | WP-03 | [adapter](../technical/backend/adapter-integrasi.md), [UAT AB](../qaqc/acceptance/ab-identity.md) |
| WP-05 | Organisasi, pengguna, peran, scope, self-service, dashboard awal | WP-04 | [matriks izin](../security/matriks-izin.md), [peta menu](../technical/frontend/peta-menu.md) |
| WP-06 | Aset, lokasi, QR, check-out/in, mutasi, laporan | WP-05 | [skema aset](../technical/database/skema-aset-jaringan.md), [UAT AC](../qaqc/acceptance/ac-assets.md) |
| WP-07 | Jaringan, IPAM, MikroTik, firewall approval, snapshot | WP-06 | [skema aset/jaringan](../technical/database/skema-aset-jaringan.md), [UAT AD](../qaqc/acceptance/ad-network.md) |
| WP-08 | Agent, metrik, alert, insiden, integrasi monitoring | WP-07 | [agent](../technical/agent/README.md), [alert](../operations/alert-dan-eskalasi.md), [UAT AE](../qaqc/acceptance/ae-monitoring.md) |
| WP-09 | Container, edge, backup konfigurasi | WP-08 | [skema operasi](../technical/database/skema-operasi-monitoring.md), [UAT AF](../qaqc/acceptance/af-containers.md), [AG](../qaqc/acceptance/ag-edge.md), [AH](../qaqc/acceptance/ah-backup.md) |
| WP-10 | Akses aman, layanan, konten, notifikasi | WP-09 | [skema layanan](../technical/database/skema-layanan-konten-audit.md), [UAT AI](../qaqc/acceptance/ai-access.md), [AJ](../qaqc/acceptance/aj-service-desk.md), [AK](../qaqc/acceptance/ak-content.md) |
| WP-11 | Audit lanjutan, review akses, platform, integrasi, impersonasi, dashboard penuh | WP-10 | [UAT AL](../qaqc/acceptance/al-audit.md), [AM](../qaqc/acceptance/am-platform.md) |
| WP-12 | Hardening, performa, pentest, DR, rilis | WP-11 | [keamanan](../security/README.md), [operasi](../operations/README.md) |

Pemetaan kasar ke roadmap produk: Tahap 1 (MVP) mencakup WP-01 sampai WP-06, ditambah agent host dan container dasar dari WP-08/WP-09; Tahap 2 mencakup WP-07, sisa WP-09, dan WP-10; Tahap 3 mencakup WP-11 dan WP-12. Urutan WP tetap mengikuti dependensi, bukan tanggal.

Status WP-01 per 2026-10-30: **selesai**. GitHub Actions run #2 (`preflight`, commit `af2ac18`) lulus untuk keenam job: `docs-and-secrets`, `rust`, `go`, `site`, `base`, dan `compose`.

## 3. Rincian work package

### WP-01 Fondasi

Deliverable:

- Struktur `osc_base`, `osc_rest`, `osc_auto`, `osc_site`, `osc_docs` dan README masing-masing.
- Compose development: PostgreSQL, PgBouncer, `osc_rest`, `osc_site`.
- `.env.example` tanpa rahasia; secret file contoh dengan placeholder.
- Pipeline preflight: lint, build, unit, validasi dokumen, secret scan.
- Skrip validator dokumen dipindahkan ke repositori.

Kriteria keluar:

- Build kosong lulus di CI.
- Compose dev dapat dijalankan dan health internal merespons.
- Tidak ada rahasia di repositori atau log.
- Validator dokumen menggagalkan tautan rusak dan registry tidak konsisten.

Status 2026-10-30 (**selesai**):

- Struktur repo, compose dev, Dockerfile, workflow preflight, `.env.example`, dan validator sudah ada.
- Workflow preflight berjalan di GitHub Actions run #2 dan keenam job lulus. Kriteria "build kosong lulus di CI" terpenuhi.
- Compose dev sudah diverifikasi lalu dihentikan dengan `down`; volume `omnisight-dev_postgres-data` sengaja dipertahankan. Hapus dengan `down -v` hanya bila data development memang boleh hilang.
- Sesuai batas WP-01, domain, auth, JWT, RLS, dan tabel domain belum dibuat; semuanya dimulai di WP-02/WP-03.

### WP-02 Skema inti

Deliverable:

- Prisma schema untuk `core`, `audit`, dan `platform` dasar.
- Migrasi SQL untuk RLS, grant, trigger audit, dan hash chain.
- Seed permission, role sistem, locale `en`, dan data uji sintetis.
- Tes isolasi dua perusahaan dan area.

Kriteria keluar:

- RLS `FORCE` aktif dan diuji dengan role `osc_rest_app`.
- Foreign key komposit mencegah relasi lintas tenant.
- Seed idempotent.
- Migrasi expand-contract lulus di staging.

Status 2026-11-02 (**belum selesai**):

- Skema fondasi, enam migrasi, RLS, grant, partisi, hash chain audit, seed, dan tes database lokal sudah ada.
- Migrasi `20261102000100_tenant_integrity` menutup celah P0: FK komposit untuk item access review dan webhook delivery, FK plus trigger tenant untuk integration link, RLS `hris_login_rules`/`hris_login_logs`, dan RLS pada setiap partisi `login_attempts`.
- Migrasi `20261102000200_login_attempts_partition_helper` menutup celah partisi masa depan: `core.ensure_login_attempts_partition(date)` membuat partisi secara idempotent (advisory lock per bulan) sekaligus menerapkan RLS `FORCE`, policy `tenant_isolation`, dan grant DML ke `osc_rest_app`. `EXECUTE` dicabut dari `PUBLIC`; aplikasi tidak bisa membuat partisi sendiri.
- `osc_base/tests/run.sh` lulus: migrasi dari database kosong, seed dua kali, isolasi dua perusahaan, FK komposit, partial unique, audit hash chain, append-only, RLS HRIS, akses langsung ke partisi, dan idempotensi helper partisi.
- Helper diuji untuk pembuatan baru, pemanggilan berulang pada bulan yang sama, bulan yang sudah punya partisi, `NULL` (`22023`), RLS tetap berlaku pada partisi baru, dan penolakan `EXECUTE`/DDL bagi `osc_rest_app`.
- Seed menghasilkan **162 baris `role_permissions` per perusahaan (324 untuk dua perusahaan)**, bukan 136/272. Angka ini berasal dari `post` yang mencakup `read` dan grant izin submodul sensitif sesuai `permissions.json`; rincian ada di [Prisma dan migrasi](../technical/database/prisma-dan-migrasi.md).
- `core.user_platform_roles` menyimpan pemberian peran, bukan definisi. Tiga definisi peran platform sementara disimpan di `platform.settings` karena belum ada tabel katalog; keputusan ada di ADR-017.
- `audit.append_event` bergantung pada owner migrasi yang memiliki `BYPASSRLS`; grant `INSERT` langsung ke `audit.audit_events` masih memungkinkan aplikasi melewati hash chain. Keputusan keamanan ada di ADR-015.
- `core.user_identities` sengaja tanpa RLS karena lookup lintas tenant; kebijakan auth khusus ada di ADR-016.
- Migrasi staging dan salinan data belum dijalankan, sehingga kriteria keluar "migrasi expand-contract lulus di staging" belum terpenuhi.
- Perubahan P0 `20261102000100_tenant_integrity` sudah di-commit (`0e70d7a`). Helper partisi dan tesnya belum di-commit.

### WP-03 Autentikasi dan audit

Deliverable:

- Login lokal Argon2id, JWT EdDSA, refresh rotation, sesi, MFA.
- CSRF, rate limit, pesan generik, audit login.
- Registry kode error dan katalog `en`/`id` untuk auth.
- Halaman login, MFA, pilih perusahaan, akses ditolak.
- Keputusan dan implementasi ADR-015 (jalur tulis audit), ADR-016 (akses `user_identities`), dan ADR-017 (peran platform/settings global).

Kriteria keluar:

- Tidak ada 403 atau 5xx aplikasi pada skenario negatif.
- Sesi kedaluwarsa dan pencabutan berlaku pada request berikutnya.
- Audit memuat `request_id`, aktor, dan hasil.
- UAT AB bagian auth lulus.

### WP-04 HRIS

Deliverable:

- Koneksi HRIS GET/POST, mapping field/role, aturan sukses/gagal dinamis.
- Timeout, circuit breaker, backoff 429, fail-closed, alert.
- Uji dengan wiremock dan data sintetis.

Kriteria keluar:

- Kegagalan HRIS tidak membocorkan detail internal.
- Fallback hanya aktif sesuai kebijakan.
- Mapping role tidak ditemukan ditolak dengan kode `AB-04-1007`.
- UAT AB bagian HRIS lulus.

### WP-05 Organisasi dan akses

Deliverable:

- Perusahaan, area bertingkat, lokasi, pengguna, undangan, membership.
- Peran, izin, scope area, self-service, pemilih perusahaan/area.
- Dashboard awal dengan data sesuai scope.

Kriteria keluar:

- Menu dan API mengikuti izin; deep link ditolak.
- Scope area mencakup turunan dan menolak area saudara.
- Perubahan peran dan pencabutan sesi berlaku segera.
- UAT AB dan UAT-G-01 sampai `UAT-G-03` lulus.

### WP-06 Aset

Deliverable:

- Kategori, model, aset, lokasi, penanggung jawab, QR.
- Check-out/in, mutasi, riwayat, laporan, ekspor.
- Foreign key komposit dan riwayat tidak dapat dihapus.

Kriteria keluar:

- Aset selalu memiliki perusahaan, area, lokasi konsisten.
- Serial duplikat dan check-out ganda ditolak dengan kode yang benar.
- QR tidak memuat data sensitif.
- UAT AC lulus.

### WP-07 Jaringan

Deliverable:

- Site, rack, perangkat, interface, prefix, IP, VLAN, topologi.
- Inventaris MikroTik, snapshot, firewall plan/diff/approval/execute/rollback.
- Integrasi NetBox/LibreNMS dengan review konflik.

Kriteria keluar:

- IP tidak keluar dari prefix dan tidak bentrok.
- Firewall tidak dapat dieksekusi tanpa approval dan snapshot.
- Rollback otomatis berjalan saat koneksi manajemen hilang.
- UAT AD lulus.

### WP-08 Agent dan monitoring

Deliverable:

- Agent Linux/Windows: heartbeat, metrik host/container, buffer, signature.
- Collector, alert rules default, insiden, retensi metrik.
- Integrasi LibreNMS/Wazuh dan triase.

Kriteria keluar:

- Agent outbound-only, mTLS, dan tidak menyimpan kredensial jangka panjang.
- Alert default dan eskalasi berjalan; silence berbatas waktu.
- Metrik tidak bocor lintas tenant.
- UAT AE lulus.

### WP-09 Container, edge, backup

Deliverable:

- Endpoint Docker/Podman via socket proxy, stack, plan, deploy, rollback.
- Domain, sertifikat, proxy host, validasi Nginx, edge node.
- Sumber backup, jadwal, snapshot, diff, restore dengan approval dan dual control.

Kriteria keluar:

- Docker socket mentah tidak dipasang ke aplikasi.
- Image dipin ke digest; deploy produksi memerlukan approval.
- Restore memerlukan approval dan snapshot pengaman.
- UAT AF/AG/AH lulus.

### WP-10 Akses, layanan, konten

Deliverable:

- Target akses, permintaan, approval, sesi, rekaman, kebijakan.
- Tiket, SLA, kontrak, knowledge base, laporan.
- Artikel, blog, template notifikasi, delivery, preferensi.

Kriteria keluar:

- Permintaan akses kedaluwarsa dan self-approval ditolak.
- Tiket dan artikel hanya terlihat sesuai scope/visibilitas.
- Notifikasi menghormati preferensi dan tidak duplikat.
- UAT AI/AJ/AK lulus.

### WP-11 Audit dan platform

Deliverable:

- Audit trail, login/akses, kejadian keamanan, review akses, ekspor, retensi.
- Integrasi, kredensial write-only, webhook/API key, scheduler, settings, feature flag, branding.
- Impersonasi dengan banner dan batas waktu.
- Dashboard agregat penuh.

Kriteria keluar:

- Audit tidak dapat dihapus dan hash chain tervalidasi.
- Ekspor memerlukan alasan dan approval.
- Kredensial tidak pernah dikembalikan ke klien.
- UAT AL/AM lulus.

### WP-12 Hardening dan rilis

Deliverable:

- Uji beban ingestion dan API, aksesibilitas, pentest internal.
- DR drill, restore drill, alert tuning.
- Dokumentasi operasi, runbook, dan panduan pengguna final.

Kriteria keluar:

- Tidak ada temuan S1/S2; S3 ditutup atau risikonya disetujui.
- SLO awal terukur.
- Restore dan rollback diuji.
- Rilis ditandatangani QA, Security, dan Product.

## 4. Jalur lintas WP

| Jalur | Aturan |
|---|---|
| Database | Setiap WP menambah migrasi expand-contract, tes RLS, dan seed idempotent |
| API | Setiap endpoint punya izin, scope, kode error, idempotency, dan contoh |
| Frontend | Setiap layar punya izin, state loading/kosong/error, i18n, dan aksesibilitas |
| Audit | Setiap aksi tulis punya event before/after dan `request_id` |
| Observability | Setiap layanan punya health, metrik, log terstruktur, dan alert |
| Keamanan | Setiap WP melewati review permukaan baru dan secret scan |
| Dokumentasi | Perubahan kontrak memperbarui dokumen, registry, dan UAT pada PR yang sama |
| Bahasa | Setiap teks baru memiliki kunci `en` dan `id` |

## 5. Gerbang

| Gate | Syarat | Penanggung jawab | Status |
|---|---|---|---|
| G0 | Dokumentasi 0.6 disetujui | Product, Tech, Security | Disetujui 2026-10-30 |
| G1 | Skema, RLS, audit dasar lulus | Data/Backend, Security | Terbuka |
| G2 | Auth, sesi, izin, dan error baseline lulus | Backend, Security, QA | Terbuka |
| G3 | UAT global dan modul terkait lulus | QA, Product | Terbuka |
| G4 | Hardening, pentest, DR, dan rilis siap | Security, Ops, Product | Terbuka |

Aturan:

- Gate tidak boleh dilewati dengan alasan jadwal.
- Temuan S1/S2 membuka gate terkait sampai ditutup.
- Perubahan arsitektur saat implementasi dicatat sebagai ADR dan memperbarui dokumen.

## 6. Definisi selesai per WP

Sebuah WP selesai bila:

- [ ] Kode, migrasi, dan konfigurasi ada di `main`.
- [ ] Unit dan integration test lulus; E2E subset lulus.
- [ ] RLS dan isolasi tenant diuji.
- [ ] Izin, scope, dan self-service diuji.
- [ ] Audit dan `request_id` tersedia untuk aksi tulis.
- [ ] Error terdaftar di registry dan terlokalisasi.
- [ ] UI memiliki state loading, kosong, error, dan aksesibilitas dasar.
- [ ] Alert/metrik untuk permukaan baru tersedia.
- [ ] Dokumentasi, UAT, dan changelog diperbarui.
- [ ] Review keamanan selesai.

## 7. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Scope creep | WP tidak selesai | Batasi pada alur vertikal; fitur baru masuk backlog |
| RLS salah | Kebocoran tenant | Tes negatif, foreign key komposit, review keamanan |
| Adapter tidak stabil | Login/operasi gagal | Wiremock, timeout, circuit breaker, fail-closed |
| Agent Windows berbeda | Data hilang | Matriks build dan uji OS sejak WP-08 |
| Alert berisik | Tim abaikan alert | Ambang awal, review bulanan, inhibisi |
| Migrasi destruktif | Data hilang | Expand-contract, backup, uji restore |
| Dokumen menyimpang | Implementasi tidak konsisten | DoD mewajibkan update dokumen di PR yang sama |
| Kunci/rahasia bocor | Insiden keamanan | Secret scan, vault, rotasi, least privilege |

## 8. Checklist sebelum WP-01

- [x] Dokumentasi 0.6 disetujui pemilik area (G0, 2026-10-30).
- [ ] Tidak ada keputusan terbuka yang memblokir skema atau auth.
- [x] Pipeline preflight sudah berjalan di GitHub (run #2 lulus, 2026-10-30).
- [ ] Environment staging tersedia.
- [ ] Pemilik WP dan reviewer ditunjuk.
- [ ] Data uji sintetis disiapkan.
- [ ] Anggaran waktu dan sumber daya disepakati.

## 9. Dokumen terkait

- [Tata kelola](README.md)
- [Keputusan arsitektur](keputusan-arsitektur.md)
- [CI/CD](../operations/ci-cd.md)
- [Operasi](../operations/README.md)
- [Matriks izin](../security/matriks-izin.md)
- [UAT](../qaqc/acceptance/README.md)
- [Unit test](../qaqc/unit-test/README.md)
- [Kontrak API](../technical/backend/kontrak-api.md)
