# OmniSight

OmniSight memakai REST API Rust (Axum), PostgreSQL, Valkey, penyimpanan objek
RustFS, dan frontend Next.js. Repositori ini juga memuat agen Go untuk
inventaris dan heartbeat node.

## Menjalankan stack Docker

Gunakan Docker Engine dengan Docker Compose 2.24.4 atau lebih baru. Dari root
repositori, siapkan `.env` lokal dengan `POSTGRES_PASSWORD`,
`POSTGRES_APP_PASSWORD`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`,
`JWT_SECRET`, dan `MFA_ENCRYPTION_KEY`. JWT memerlukan minimal 32 byte acak.
Kunci MFA memakai Base64 dari tepat 32 byte acak. Gunakan nilai khusus lingkungan
uji dan simpan `.env` di luar kontrol versi.

Compose utama memakai jaringan eksternal `blackbox`. Jika belum tersedia pada
host uji, buat bridge dengan subnet yang mencakup IP statis layanan.

```sh
docker network inspect blackbox >/dev/null 2>&1 ||
  docker network create --driver bridge --subnet 172.99.0.0/16 blackbox
```

Untuk volume database baru, jalankan PostgreSQL terlebih dahulu. Terapkan
migrasi inti, kebijakan RLS, dan seed demo sebelum menunggu healthcheck API.

```sh
docker compose up -d --wait osc_base
for sql in osc_base/migrations/001_init_core.sql \
           osc_base/migrations/002_rls_policies.sql \
           osc_base/seeds/001_seed_demo.sql; do
  docker compose exec -T osc_base sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < "$sql" || break
done
```

Seed demo menyediakan company `IDM`, area `JKT` dan `SBY`, serta akun lokal
`admin`. Gunakan kata sandi seed dari pengelola lingkungan uji atau pakai
akun Super Admin lokal tanpa MFA yang sudah diprovisi untuk pengujian.

```sh
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:36664/baas/v1/health
curl -fsS http://127.0.0.1:36664/baas/v1/public/companies
```

Jalankan smoke test setelah kelima layanan berstatus `healthy`.

| Layanan | Port host |
|---|---:|
| PostgreSQL | 36661 |
| Valkey | 36662 |
| RustFS | 36663 |
| REST API | 36664 |
| Web (Next.js) | 36665 |

Gunakan `docker compose down` untuk menghentikan stack. Untuk jaringan
pengembangan yang dikelola Compose, tersedia `make up-dev` dan `make down-dev`.
[Panduan suite integrasi](osc_docs/test_flow/README.md)

## Menjalankan smoke test

Gunakan Python 3.10+ dan stack uji dengan data yang boleh direset. Suite membuat
SOP, lampiran RustFS, arsip laporan, dan target PAM jika belum ada target aktif.
Regresi parser HRIS menjalankan pengujian Rust yang sudah ada melalui Cargo
tanpa memerlukan server HRIS.

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r osc_docs/requirements-test.txt

export OMNISIGHT_TEST_API_URL=http://127.0.0.1:36664
export OMNISIGHT_TEST_ADMIN_USERNAME=admin
read -rsp 'Kata sandi admin uji: ' OMNISIGHT_TEST_ADMIN_PASSWORD
export OMNISIGHT_TEST_ADMIN_PASSWORD
printf '\n'

OMNISIGHT_TEST_REQUIRE_FIXTURES=1 pytest -q -c osc_docs/pytest.ini \
  osc_docs/test_flow/test_core_e2e.py \
  osc_docs/test_guard/test_core_security.py
```

- `test_core_e2e.py` memeriksa healthcheck, public companies, login, navigasi,
  perpindahan konteks, SOP dan lampirannya, laporan RP01 dan RP02, konektor SA04,
  serta audit log.
- `test_core_security.py` memeriksa penolakan cookie/JWT, izin PAM tanpa MFA,
  validasi endpoint HRIS, serta aturan parser yang memblokir DTD dan membatasi
  ukuran XML. Mode ketat di atas memerlukan Cargo dan kredensial admin.
- Gunakan `OMNISIGHT_TEST_TARGET_COMPANY_ID` dan
  `OMNISIGHT_TEST_TARGET_AREA_ID` untuk memilih konteks. Gunakan
  `OMNISIGHT_TEST_PAM_TARGET_ID` untuk memakai target PAM yang sudah tersedia.

[Catatan verifikasi](osc_docs/notes/20261121-core-06-verify.md) · [Dokumentasi API](osc_rest/README.md) · [Topologi sistem](osc_docs/topology/SYSTEM_TOPOLOGY.md)
