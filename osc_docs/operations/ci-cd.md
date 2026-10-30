# CI/CD dan Gerbang Rilis

Status: Disetujui (0.6); revisi 2026-10-30 mencatat penyedia CI dan versi pin dari WP-01

Dokumen ini mengatur pipeline integrasi dan pengiriman OmniSight: build, tes, pemindaian, artefak, deploy staging, promosi, dan rilis produksi. Pipeline adalah pelaksana aturan di [unit test](../qaqc/unit-test/README.md), [UAT](../qaqc/acceptance/README.md), [keamanan](../security/README.md), dan [operasi](README.md).

Dokumen ini belum berisi konfigurasi pipeline lengkap untuk seluruh tahap. Pipeline preflight yang nyata ada di `.github/workflows/preflight.yml` dan dijelaskan pada bagian 2; tahap build, integration, security, E2E, package, dan deploy menyusul pada WP berikutnya.

## 1. Prinsip

1. **Main selalu dapat dirilis**: setiap commit di `main` sudah lolos gerbang wajib.
2. **Build sekali, deploy berkali-kali**: artefak yang sama dipromosikan dari staging ke produksi.
3. **Reproducible**: dependency dipin, image memakai digest, build memakai versi tool yang tetap.
4. **Least privilege**: pipeline memakai kredensial berumur pendek dan izin minimum per lingkungan.
5. **Tidak ada rahasia di log atau artefak**: secret dipindai dan disuntik saat deploy.
6. **Gerbang tidak bisa dilewati**: kegagalan tes, scan kritis, atau migrasi menghentikan pipeline.
7. **Dokumentasi ikut diuji**: tautan, kode, izin, UAT, dan katalog bahasa diperiksa otomatis.
8. **Rollback direncanakan**: setiap rilis punya artefak sebelumnya dan langkah kembali.

## 2. Penyedia CI, workflow, dan versi pin

Penyedia CI awal adalah **GitHub Actions** (ADR-014). Workflow preflight berada di `.github/workflows/preflight.yml` dan berjalan pada `push` ke `main` serta setiap pull request, dengan izin `contents: read` saja.

| Job | Isi |
|---|---|
| `docs-and-secrets` | `validate_docs.py`, `validate_contracts.py`, `scan_secrets.py` |
| `rust` | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, `cargo build --release` |
| `go` | `go vet`, `go test ./...`, `go build ./...` |
| `site` | `npm ci`, `npm run lint` (`tsc --noEmit`), `npm test`, `npm run build` |
| `base` | `npm ci`, `prisma validate` dengan `DATABASE_URL` placeholder |
| `compose` | `docker compose config` pada `deploy/compose/core.compose.yaml` |

Versi tool yang dipin pada WP-01:

| Tool | Versi | Sumber pin |
|---|---|---|
| Rust | `1.99.1` | `dtolnay/rust-toolchain` di workflow |
| Go | `1.22` | `osc_auto/go.mod` |
| Node.js | `22.23.4` | `actions/setup-node` di workflow |
| Next.js | `16.4.3` | `osc_site/package.json` |
| Prisma | `6.7.0` | `osc_base/package.json` |
| PostgreSQL (dev) | `17.11-alpine3.24` | `deploy/compose/core.compose.yaml` |
| PgBouncer (dev) | `v1.26.1-p0` | `deploy/compose/core.compose.yaml` |

Aturan:

- Perubahan versi tool atau image wajib memperbarui tabel ini dan lockfile terkait dalam PR yang sama.
- Workflow tidak memuat rahasia; job yang membutuhkan database nyata memakai service container pada WP berikutnya.
- Logika validasi tetap berada di skrip Python dan perintah build komponen; workflow hanya merangkai agar mudah dipindahkan bila penyedia CI berubah.
- Status WP-01: perintah padanan sudah dijalankan lokal dan lulus; eksekusi GitHub Actions pertama menunggu push ke repositori. Sampai itu terjadi, pipeline belum dianggap terbukti di CI dan WP-01 berstatus blocking.

Risiko supply-chain yang diterima pada WP-01:

- Action dipin ke tag mayor (`actions/checkout@v4`, `actions/setup-python@v5`, `actions/setup-node@v4`, `actions/setup-go@v5`) dan `dtolnay/rust-toolchain@master`, bukan commit SHA.
- Mitigasi saat ini: workflow hanya memakai izin `contents: read`, tidak memakai secret, dan toolchain tetap dipin ke versi eksplisit.
- Sebelum rilis produksi (WP-12), action wajib dipin ke commit SHA dan diperbarui lewat review, bukan otomatis.

## 3. Branch dan rilis

| Aturan | Nilai |
|---|---|
| Model | Trunk-based dengan branch pendek |
| Branch utama | `main`, dilindungi |
| Branch fitur | `feat/<ringkas>`, `fix/<ringkas>`, `docs/<ringkas>` |
| Merge | Squash merge setelah review dan checks lulus |
| Rilis | Tag `vMAJOR.MINOR.PATCH` dari commit `main` |
| Hotfix | Branch dari tag, PR ke `main`, lalu tag patch |
| Ukuran PR | Kecil dan satu tujuan; perubahan besar dipecah |

Aturan:

- Perubahan database, API, menu, izin, dan dokumentasi terkait berada dalam PR yang sama.
- Minimal satu reviewer; perubahan keamanan, izin, dan migrasi memerlukan reviewer pemilik area.
- Jangan force-push ke `main` atau tag rilis.
- Jangan merge dengan tes flaky; perbaiki atau hapus tes tersebut.

## 4. Tahap pipeline

```text
preflight → build → unit → integration → security → E2E → package → staging → UAT → production
```

| Tahap | Isi | Gagal bila |
|---|---|---|
| Preflight | Validasi dokumen, tautan, pagar kode, registry izin/error, paritas locale, validasi compose | Tautan rusak, kode tak terdaftar, locale tidak paritas |
| Build | `cargo build`, `go build`, build Next.js, `prisma validate` | Kompilasi/type check gagal |
| Unit | Unit test per komponen | Tes gagal atau cakupan kritis turun |
| Integration | PostgreSQL sementara, migrasi, RLS, wiremock, MSW | Migrasi gagal, RLS bocor, kontrak adapter berubah |
| Security | Audit dependency, secret scan, SAST, scan image, scan compose | Temuan kritis/tinggi terbuka |
| E2E | Playwright untuk login, scope, aset, deploy, approval, audit; axe | Alur kritis gagal atau aksesibilitas kritis |
| Package | Image by digest, SBOM, signature, checksum, binary agent | Artefak tidak dapat diverifikasi |
| Staging | Deploy otomatis dari `main`, migrasi, smoke test | Health atau smoke test gagal |
| UAT | Skenario global dan modul di staging | S1/S2 terbuka atau bukti tidak lengkap |
| Production | Deploy manual dengan approval dan change record | Gate tidak lengkap atau approval tidak ada |

## 5. Gerbang per pull request

Wajib lulus sebelum merge:

- [ ] Format, lint, dan type check.
- [ ] Unit test komponen yang berubah dan tes regresi.
- [ ] Integration test untuk perubahan database, API, adapter, atau agent.
- [ ] Validasi dokumen dan registry kode error.
- [ ] Paritas kunci `en`/`id`.
- [ ] Secret scan bersih.
- [ ] Dependency audit tanpa temuan kritis/tinggi yang belum disetujui.
- [ ] Review minimal satu orang; reviewer area untuk perubahan sensitif.
- [ ] Tidak ada perubahan konfigurasi produksi atau rahasia di PR.

## 6. Gerbang rilis

Wajib lulus sebelum tag dan deploy produksi:

- [ ] Semua checks PR lulus pada commit tag.
- [ ] Migrasi diuji di staging dan kompatibel expand-contract.
- [ ] Backup database terbaru tersedia dan restore diuji sesuai jadwal.
- [ ] UAT global dan modul terkait `Lulus`; tidak ada S1/S2.
- [ ] Pentest/temuan kritis ditutup atau risiko disetujui.
- [ ] SBOM dan image signature tersedia.
- [ ] Smoke test staging lulus.
- [ ] Change record, rollback plan, dan jadwal disetujui.
- [ ] Dokumentasi dan changelog diperbarui.

## 7. Build per komponen

| Komponen | Perintah inti | Catatan |
|---|---|---|
| `osc_base` | `prisma validate`, `prisma migrate deploy` di job migrasi | Prisma bukan ORM runtime |
| `osc_rest` | `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo build --release` | SQLx offline data diperbarui bila query berubah |
| `osc_auto` | `go vet`, `go test ./...`, `go build` | Matriks Linux dan Windows |
| `osc_site` | lint, `tsc --noEmit`, `next build` | Build sekali; env publik tidak memuat rahasia |
| Agent | `go test`, cross-compile, sign binary | Linux amd64/arm64, Windows amd64 |
| Dokumen | validator Python | Gagal pada tautan rusak atau registry tidak konsisten |

Aturan:

- Dependency dikunci dengan lockfile.
- Toolchain memakai versi yang dipin di image CI.
- Build tidak mengunduh artefak tak bertanda tangan saat runtime.
- Build frontend tidak memakai `NEXT_PUBLIC_*` untuk rahasia.

## 8. Tes dan data

- Unit test tidak memakai layanan nyata; integration memakai PostgreSQL sementara dan wiremock.
- E2E memakai data sintetis dua perusahaan dan dua area.
- Setiap tes menulis hasil mesin-terbaca (JUnit/XML atau JSON) sebagai artefak.
- Cakupan dipantau; penurunan cakupan pada policy izin, RLS, dan pemetaan error kritis menggagalkan gate.
- Tes flaky diberi karantina maksimal 7 hari dengan tiket; setelah itu diperbaiki atau dihapus.
- Jangan menonaktifkan tes untuk melewati gate tanpa persetujuan QA dan Tech Lead.

## 9. Keamanan pipeline

- Secret scanning pada commit dan PR.
- Dependency audit per ekosistem: Rust, Go, Node.js.
- SAST untuk Rust, Go, dan TypeScript.
- Scan image container dan filesystem sebelum push.
- SBOM CycloneDX dibuat untuk setiap image dan binary agent.
- Image dan binary ditandatangani; digest dicatat di release manifest.
- Pipeline memakai identitas kerja berumur pendek (OIDC) bila tersedia; hindari kunci statis.
- Kredensial produksi hanya tersedia di environment produksi dengan approval.
- Log pipeline tidak mencetak environment, token, atau isi secret.
- Pull request dari fork tidak mendapat akses secret.

## 10. Migrasi database di pipeline

Urutan:

1. Job migrasi memeriksa backup terbaru.
2. Jalankan `prisma migrate deploy` pada database staging.
3. Jalankan tes RLS, constraint, dan seed idempotent.
4. Deploy aplikasi versi baru.
5. Smoke test.
6. Untuk produksi, ulangi dengan approval dan backup pra-deploy.

Aturan:

- Migrasi forward-only dan expand-contract.
- DDL tidak dijalankan aplikasi saat runtime.
- Migrasi destruktif dipisah ke rilis berikutnya setelah kode lama tidak dipakai.
- Rollback aplikasi ke image sebelumnya; database tidak di-rollback tanpa prosedur restore.
- Job migrasi gagal menghentikan deploy, bukan dilewati.

## 11. Deploy staging

- Otomatis dari `main` setelah package lulus.
- Memakai compose/quadlet yang sama dengan produksi, beda nilai env dan secret.
- Data sintetis atau salinan tersamarkan.
- Smoke test: login, dashboard, satu endpoint per modul, health internal, audit event.
- Hasil UAT dan artefak disimpan per build.

## 12. Deploy produksi

- Manual dengan approval dan change record.
- Deploy image digest yang sama dengan staging.
- Urutan: backup → migrasi → `osc_rest` rolling → `osc_auto` → `osc_site` → edge bila berubah → smoke test → pantau.
- Jangan deploy di luar jadwal tanpa persetujuan.
- Setelah deploy, pantau kode error, latency, alert, dan outbox.
- Jika gagal, rollback aplikasi dan buka insiden.

## 13. Artefak dan retensi

| Artefak | Retensi awal |
|---|---|
| Laporan tes dan cakupan | 90 hari |
| SBOM dan signature | Selama image didukung |
| Release manifest | Permanen |
| Log deploy | 1 tahun |
| Bukti UAT | Sesuai kebijakan audit |
| Image | Minimal 2 rilis terakhir |

Aturan:

- Artefak tidak memuat secret atau data pribadi.
- Release manifest mencatat commit, tag, digest, SBOM, dan hasil gate.
- Artefak dapat diunduh oleh auditor bila disetujui.

## 14. Rollback dan hotfix

- Rollback aplikasi memakai image digest sebelumnya.
- Pastikan migrasi masih kompatibel dengan versi lama.
- Hotfix melewati antrean fitur, tetapi tidak melewati tes, scan, dan review.
- Hotfix produksi tetap memerlukan change record dan smoke test.
- Setelah hotfix, tambahkan tes regresi dan perbarui dokumentasi.

## 15. Metrik pipeline

- Waktu pipeline dan waktu deploy.
- Tingkat kegagalan pipeline.
- Frekuensi deploy dan lead time perubahan.
- Waktu pemulihan (MTTR).
- Temuan keamanan yang lolos ke staging/produksi.
- Tes flaky dan cakupan kritis.

Metrik dipakai untuk perbaikan, bukan untuk menekan tim melewati gerbang.

## 16. Checklist

- [ ] `main` dilindungi dan checks wajib aktif.
- [ ] Build reproducible dengan dependency terkunci.
- [ ] Unit, integration, E2E, dan aksesibilitas berjalan di pipeline.
- [ ] Secret scan, dependency audit, SAST, dan image scan aktif.
- [ ] SBOM dan signature dibuat untuk setiap rilis.
- [ ] Migrasi diuji dan tidak destruktif dalam satu rilis.
- [ ] Deploy staging otomatis; produksi manual dengan approval.
- [ ] Smoke test dan rollback diuji.
- [ ] Artefak dan release manifest tersimpan.
- [ ] Dokumen dan registry diperbarui pada PR yang sama.

## 17. Dokumen terkait

- [Operasi dan deployment](README.md)
- [Alert dan eskalasi](alert-dan-eskalasi.md)
- [Impor data](impor-data.md)
- [Rencana implementasi](../governance/rencana-implementasi.md)
- [Keputusan arsitektur](../governance/keputusan-arsitektur.md)
- [Unit test](../qaqc/unit-test/README.md)
- [UAT](../qaqc/acceptance/README.md)
- [Keamanan](../security/README.md)
- [Registry kode error](../technical/backend/kode-error.md)
