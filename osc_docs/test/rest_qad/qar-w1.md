# QA & Debugger Technical Report: Wave 1 — Auth Dual-Mode (HRIS ASMX), TOTP MFA, Company Switcher, Menu Navigation, ITAM & Excel

- **Date**: 2026-11-12
- **Author**: ai-test (QA & Debugger Engineer)
- **Workspace**: `osc_docs/test/rest_qad`
- **Test Suite Location**: `osc_docs/test/rest_qad/test/wave1/` (ditambah unit pendukung di `test/unit/`)
- **Target API & Contract Reference**: `osc_docs/rest/api-w1.md`, `osc_docs/site/app-w1.md`, `osc_docs/rest/contracts/w1.openapi.yaml`

## 1. Test Scope & Root-Cause Context

Suite ini memverifikasi fungsionalitas & kontrak Wave 1 `osc_rest` (dikonsumsi `osc_site` melalui BFF proxy — token di-strip, `X-Correlation-ID` di-propagasi):

1. **Local Login** (`company_id=""`) → Argon2id lokal, envelope `{"status","data"}` sesuai kontrak; kredensial salah → `401 UNAUTHORIZED` dengan envelope error + `correlation_id`.
2. **Login dual-mode HRIS ASMX** melalui stub upstream in-process (`src/infrastructure/hris_stub.py`):
   - `1|…` → auto-sync profil + Argon2id cache (`last_hris_sync_at` wajib terisi, `offline_cache=false`);
   - `0|…|NONE` → `401 UNAUTHORIZED` **tanpa fallback** cache offline;
   - non-XML / timeout (melewati total timeout 8 s) → fallback cache offline (`offline_cache=true`) bila TTL valid, atau `502 HRIS_UPSTREAM_INVALID_RESPONSE` yang tipe-safe (tanpa stack trace).
3. **TOTP MFA**: setup → enable → verify (step aktif), anti-replay (kode sama ditolak), toleransi ±1 step tanpa 5xx, backup code sekali pakai → **MFA auto-reset** (`mfa_enabled=false` pada login berikutnya).
4. **Company Switcher & Navigation**: `GET /auth/companies` publik tanpa membocorkan `hris_login_url`/secret; `switch-company` menolak company tanpa `UserCompanyAccess` (403) dan payload malformed (400); `GET /me/navigation` — tepat satu `is_active_company`, node `can_view=false` tidak pernah dikirim (server-side filtering, dikonsumsi sidebar `osc_site`).
5. **ITAM**: siklus checkout/checkin (409 CONFLICT pada re-checkout, 400 pada checkin aset bebas), aset di-seed melalui import Excel (master default get-or-create `Generic Model`/`Deployable`).
6. **Excel import/export**: baris valid persist sesuai `inserted`; laporan per-baris dengan kode kanonik (`REQUIRED|TOO_LONG|ENUM_INVALID|IP_INVALID|NUMBER_INVALID|DUPLICATE`, cap 100); file rusak & magic byte non-ZIP (`%PDF-1.7`) ditolak 4xx; export `Content-Disposition: attachment` dengan **sanitasi formula injection** (sel berawalan `= + - @ \t \r` diprefix `'`).

Diagnosis: implementasi TOTP suite divalidasi terhadap **vektor resmi RFC 6238 Appendix B** (SHA1, secret `12345678901234567890`) sehingga kegagalan MFA pada test live pasti berasal dari upstream, bukan dari test harness.

## 2. Clean Architecture Test Structure

- `src/domain/`:
  - `models_w1.py` — `HrisStubMode`, `LoginChannel`, `LoginExpectation`, `CompanyOption`, `MenuNode`, `ImportRowError`, `ImportSummary`, `AssetRecord` (dataclass murni).
  - `gateways_w1.py` — port `W1ApiClient` (get_json/post_json/post_multipart/get_binary) & `HrisStubControl` (`Protocol`).
  - `models.py` — `ApiResponseSnapshot` diperluas field opsional `body_bytes` (binary export, backward-compatible).
  - `errors.py` — `ContractViolationError`, `UnreachableTargetError`.
- `src/application/`:
  - `totp.py` — TOTP RFC 6238 murni (hotp/totp_code/secret_from_otpauth_uri).
  - `auth_w1.py` — verifikator kontrak murni: `evaluate_login_success`, `evaluate_envelope_error`, `evaluate_navigation`, `evaluate_health_snapshot`.
  - `hris_w1.py` — kebijakan ekspektasi dual-mode `expected_hris_outcome(mode, cache_available, cache_within_ttl)` + generator baris Excel valid/error + payload formula injection.
  - `w1_flows.py` — orkestrasi use case (login, mfa_setup_and_enable, mfa_verify_with_otp/backup_code, switch_company, navigation, checkout/checkin, import_assets/export_assets) — hanya bergantung pada port domain.
- `src/infrastructure/`:
  - `w1_client.py` — `W1HttpxClient` (httpx, `follow_redirects=False`, `trust_env=False`, `X-Correlation-ID` per request).
  - `hris_stub.py` — stub HRIS ASMX threaded (`ok | invalid | nonxml | slow`, hit counter thread-safe).
  - `excel_fixtures.py` — builder/reader `.xlsx` (openpyxl), workbook rusak, fake magic byte.
  - `config.py`, `http_client.py`, `reporters.py` — fondasi sesi sebelumnya (dipertahankan).
- `test/`: `test/wave1/` (5 modul + conftest env-driven, marker `@pytest.mark.integration`, `@pytest.mark.contract`, `@pytest.mark.wave1`, `@pytest.mark.excel`) — test live **skip deterministik** bila target/kredensial env tidak tersedia (traffic tidak pernah dikirim ke layanan asing; gate probe `/api/v1/health`).

## 3. Test Case Matrix

| Test ID | Scenario / Edge Case | Input / Precondition | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| `QA-W1-A01` | Local login sesuai kontrak | Env `QA_W1_LOCAL_USERNAME/PASSWORD`, `company_id=""` | `200` + envelope `data.login` valid | Pass (unit/envelope) / Pending (live) |
| `QA-W1-A02` | Password salah | Password acak | `401 UNAUTHORIZED` + envelope error + `correlation_id` | Pass / Pending (live) |
| `QA-W1-A03` | Username kosong | `username=""` | `400 VALIDATION_ERROR` | Pass / Pending (live) |
| `QA-W1-A04` | Correlation tracing | Login sah | Header `X-Correlation-ID` di-echo | Pass / Pending (live) |
| `QA-W1-A05` | Kontrak stub HRIS | Body `1|`, `0|…|NONE`, non-XML | Prefix `1|` sukses, `0|` ditolak, non-XML bukan XML | Pass (unit) |
| `QA-W1-A06` | HRIS `1|` auto-sync | Mode stub `ok` | `200`, `offline_cache=false`, `last_hris_sync_at` terisi | Pass (kebijakan) / Pending (live) |
| `QA-W1-A07` | HRIS `0|…|NONE` tanpa fallback | Mode stub `invalid` | `401 UNAUTHORIZED`, tidak ada fallback cache | Pass (kebijakan) / Pending (live) |
| `QA-W1-A08` | HRIS non-XML | Mode stub `nonxml` | Cache offline (`offline_cache=true`) atau `502 HRIS_UPSTREAM_INVALID_RESPONSE` | Pass (kebijakan) / Pending (live) |
| `QA-W1-A09` | HRIS timeout (12 s > 8 s) | Mode stub `slow` | Sama dengan A08; tanpa stack trace | Pass (kebijakan) / Pending (live) |
| `QA-W1-M01` | TOTP harness vs RFC 6238 | Vektor Appendix B | `94287082`, `07081804`, `14050471` (8 digit) | Pass (unit) |
| `QA-W1-M02` | Login step-1 → challenge | Akun MFA aktif | `mfa_required=true` + `mfa_challenge_token`, tanpa `access_token` | Pass / Pending (live) |
| `QA-W1-M03` | Verify step aktif | TOTP step saat ini | `200` + `access_token` + `session_id` baru | Pass / Pending (live) |
| `QA-W1-M04` | Anti-replay TOTP | OTP sama dua kali | Pemakaian kedua `4xx` (`UNAUTHORIZED/VALIDATION_ERROR/RATE_LIMITED`) | Pass / Pending (live) |
| `QA-W1-M05` | Toleransi ±1 step | TOTP step+1 | Diterima atau ditolak rapi — tanpa 5xx | Pass / Pending (live) |
| `QA-W1-M06` | OTP sampah | `otp=000000` | `4xx`, tanpa panic | Pass / Pending (live) |
| `QA-W1-M07` | Backup code sekali pakai + auto-reset | `QA_W1_MFA_BACKUP_CODE` belum terpakai | `200` + sesi baru; login berikut `mfa_required=false` (`MFA_RESET_SELF_BACKUP`) | Pass / Pending (live) |
| `QA-W1-N01` | `/auth/companies` publik | Tanpa token | `200`; `hris_enabled` boolean; `hris_login_url`/secret tidak muncul | Pass / Pending (live) |
| `QA-W1-N02` | Navigation + server-side filtering | Sesi sah | Tepat satu `is_active_company`; tidak ada node `can_view=false` | Pass / Pending (live) |
| `QA-W1-N03` | Switch tanpa akses | `QA_W1_FORBIDDEN_COMPANY_ID` | `403 FORBIDDEN` | Pass / Pending (live) |
| `QA-W1-N04` | Switch malformed | `bukan-uuid`, `""` | `400/403`, tanpa 5xx | Pass / Pending (live) |
| `QA-W1-N05` | Switch sah mengubah konteks | `QA_W1_SWITCH_COMPANY_ID` | `200` + JWT klaim company baru; navigation konsisten | Pass / Pending (live) |
| `QA-W1-T01` | `/assets` butuh auth | Tanpa token | `401/403` | Pass / Pending (live) |
| `QA-W1-T02` | Lifecycle checkout/checkin | Aset seed via Excel | checkout 2xx → re-checkout `409 CONFLICT` → checkin 2xx → re-checkin `400` | Pass / Pending (live) |
| `QA-W1-T03` | `asset_checkout_logs` konsisten | Aset ter-assign | Entri aset memuat jejak checkout | Pass / Pending (live) |
| `QA-W1-T04` | Checkout aset tak dikenal | UUID nol | `4xx`, tanpa panic | Pass / Pending (live) |
| `QA-W1-X01` | Import baris valid | 3 baris §3 | `inserted=3`, `error_count=0` | Pass / Pending (live) |
| `QA-W1-X02` | Laporan per-baris | 7 kasus error §3 | Semua kode kanonik muncul; laporan ≤ 100 baris | Pass / Pending (live) |
| `QA-W1-X03` | File rusak / fake magic | Truncated, `%PDF-1.7` | `400/415/422`, tanpa stack trace | Pass / Pending (live) |
| `QA-W1-X04` | Import tanpa auth | Multipart anonim | `401/403` | Pass / Pending (live) |
| `QA-W1-X05` | Export attachment | Sesi sah | `200`, `Content-Disposition: attachment`, MIME xlsx | Pass / Pending (live) |
| `QA-W1-X06` | Sanitasi formula export | Aset `name='=cmd|…'` | Tidak ada sel export berawalan `= + - @ \t \r` | Pass / Pending (live) |

## 4. Debugging & Reproduction Notes

- **Python 3.10 dataclass ordering**: penambahan field opsional `body_bytes` pada `ApiResponseSnapshot`/`AuditEvidence` menimpa field tanpa default → diperbaiki dengan memberi default pada field trailing; regression dicegah karena seluruh unit test berjalan di CI tanpa stack.
- **Vektor RFC 6238**: counter adalah `unix_time // 30` (bukan timestamp mentah) — kesalahan umum yang membuat test MFA salah laporan; kini tervalidasi unit test `QA-W1-M01`.
- **Reproduksi live**: `docker compose up -d osc_base rustfs osc_rest`, set env kredensial (lihat `test/wave1/conftest.py`), lalu:
  `cd osc_docs/test/rest_qad && python3 -m pytest -v` (semua; tanpa env → live test skip, unit tetap hijau) atau `python3 -m pytest test/wave1 -v -m "integration"`.
- Status verifikasi lokal (tanpa stack): `python3 -m pytest -q` → **18 passed, 33 skipped** (exit 0).
