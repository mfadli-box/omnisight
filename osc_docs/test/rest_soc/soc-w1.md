# SOC Security Verification Report: Wave 1 — MFA Challenge Bypass, TOTP Replay, Switch-Company IDOR, Cross-Tenant Leakage, Filter AST SQLi & Excel Formula Injection

- **Date**: 2026-11-12
- **Author**: ai-test (SOC Security Engineer)
- **Workspace**: `osc_docs/test/rest_soc`
- **Security Test Suite Location**: `osc_docs/test/rest_soc/test/wave1/` (unit vektor di `test/unit/`)
- **Target API & Contract Reference**: `osc_docs/rest/api-w1.md`, `osc_docs/site/app-w1.md`, `osc_docs/rest/contracts/w1.openapi.yaml`

## 1. Threat Model & Attack Surface

Permukaan serangan Wave 1 yang diaudit (non-destruktif, target lokal via env, request dibatasi `SOC_MAX_REQUESTS_PER_TEST`):

1. **Boundary auth MFA** — challenge JWT 5 menit `scope=mfa_pending` hanya sah di `/api/v1/auth/mfa/*` (api-w1 §5). Vektor: token palsu (`alg:none`, signature sampah HS256, challenge expired, scope-confusion) dicoba ke 6 endpoint bisnis + `switch-company` + write path `items/{collection}`.
2. **TOTP anti-replay** — `mfa_last_verified_step` wajib menolak step ≤ tersimpan; backup code sekali pakai. Vektor: OTP yang sama dikirim dua kali berturut-turut.
3. **IDOR company switcher** — `POST /auth/switch-company` wajib mem-validasi `UserCompanyAccess` dari baris sesi DB (bukan klaim JWT). Vektor: `company_id` tenant asing + malformed (non-UUID, kosong, traversal, SQLi string).
4. **Cross-tenant data leakage** — semua endpoint tenant (`assets/licenses/tickets/dcim/ipam/files`) wajib menyaring `company_id` dari sesi. Vektor: enumerasi payload mencari foreign company id; `GET /assets/{id}` & `GET /files/{id}` milik tenant asing; `?filter` dengan field `company_id` (field tak terdaftar → 400).
5. **SQL injection pada dynamic `filter` AST** — kontrak: peta field server-side, nilai 100% `push_bind`, kedalaman ≤ 8, ≤ 64 node. 12 probe: tautology, stacked `DROP TABLE`, `pg_sleep`, `UNION SELECT`, injeksi identifier field & operator, kunci AST asing, cross-tenant field, depth overflow (10), node flood (80), operator unknown, value mongo-style `{"$ne": null}`.
6. **Excel formula injection (CWE-1236)** — workbook dengan sel `=cmd|'/C calc'!A0`, `+1+cmd|…`, `@SUM`, `=WEBSERVICE(...)` di-import lalu hasil `/assets/export` diverifikasi bersanitasi (prefix `'`); import juga sah menolak `400` dengan laporan per baris.

## 2. Clean Architecture Security Suite Structure

- `src/domain/`: `findings.py` — `Severity`, `AuditEvidence` (+ field opsional `body_bytes` untuk export biner), `SecurityFinding`; `gateways.py` — port `SecurityClient`; `errors.py` — `UnreachableTargetError`.
- `src/application/`:
  - `w1_vectors.py` — vektor murni: `forged_challenge_tokens()` (4 token palsu), `totp_code`/`replay_otp` (RFC 6238), `FORBIDDEN_SWITCH_PAYLOADS`, `filter_ast_sql_injection()` (12 `FilterProbe`), `FORMULA_INJECTION_CELLS`, `SQL_ERROR_MARKERS`.
  - `w1_audit.py` — use case asersi → `SecurityFinding`: `audit_challenge_rejected`, `audit_totp_replay`, `audit_switch_company_idor`, `audit_no_cross_tenant_data`, `audit_filter_sqli`, `audit_export_sanitization`.
  - `exploit_vectors.py` — fondasi sesi sebelumnya (`alg:none`, payload SQLi/traversal/formula) dipertahankan.
- `src/infrastructure/`: `w1_soc_client.py` — fasad JSON/multipart/binary di atas `HttpxSecurityClient` (redaksi header sensitif, correlation id per request); `malicious_xlsx.py` — builder workbook berbahaya (openpyxl) + reader verbatim; `security_client.py`, `evidence.py`, `config.py` (Rules of Engagement).
- `test/`: `test/wave1/` — 5 modul penetrasi (`@pytest.mark.soc`, `auth_bypass`, `idor`, `injection`, `file_upload_abuse`, `wave1`) + conftest env-driven (sesi tenant via `SOC_W1_USERNAME/PASSWORD/MFA_SECRET`); skip deterministik bila target/env tidak tersedia (RoE: vektor tidak pernah dikirim ke layanan asing).

## 3. Security Control & Attack Matrix

| Check ID | OWASP / CWE Category | Attack Vector Tested | Expected Defense | Result |
| :--- | :--- | :--- | :--- | :--- |
| `SOC-W1-001` (AB01–AB03) | API2:2023 Broken Authentication / CWE-347 | Token palsu `alg:none`, HS256 sig sampah, expired, scope-confusion → 6 endpoint bisnis + `switch-company` + `items` write | `401/403` di semua path; `scope=mfa_pending` hanya sah di `/auth/mfa/*` | Pass (unit: vektor) / Pending (live) |
| `SOC-W1-002` (RP01–RP03) | API2:2023 / CWE-294 (Replay) | OTP TOTP sama dikirim 2×; backup code dipakai 2× | Pemakaian kedua ditolak `4xx` (`mfa_last_verified_step`); backup code sekali pakai + auto-reset | Pass / Pending (live) |
| `SOC-W1-003` (ID01–ID03) | API1:2023 BOLA / CWE-639 | `switch-company` ke company asing tanpa `UserCompanyAccess`; payload malformed | `403 FORBIDDEN`/`404`; konteks sesi TIDAK berpindah setelah penolakan | Pass / Pending (live) |
| `SOC-W1-004` (TL01–TL04) | API1:2023 / API3:2023 / CWE-639 | Enumerasi payload 7 endpoint tenant; `GET /assets/{id}` & `/files/{id}` asing; filter field `company_id` | Payload bebas foreign id; objek asing `403/404`; field tenant tak terdaftar → `400` | Pass / Pending (live) |
| `SOC-W1-005` (SQLI, 12 probe) | API8:2023 / CWE-89 | Tautology, stacked `DROP TABLE`, `pg_sleep`, `UNION SELECT`, injeksi identifier/operator AST, depth>8, node>64, operator/value abuse | Tidak ada `5xx`, tidak ada marker error SQL (`syntax error`, `psql:`, `panic`); nilai 100% push_bind; AST ilegal → `400` | Pass / Pending (live) |
| `SOC-W1-006` (XF01–XF03) | API8:2023 / CWE-1236 Formula Injection | Upload workbook sel `=cmd\|'/C calc'!A0`, `+1+cmd\|…`, `@SUM`, `=WEBSERVICE(...)` → export kembali | Import `200` (tersanitasi/laporan) atau `400`; export TIDAK memuat sel berawalan `= + - @ \t \r` tanpa prefix `'` | Pass / Pending (live) |

## 4. Remediation & Hardening Recommendations

Semua kontrol kontraktual **belum dapat diverifikasi end-to-end** pada sesi ini (stack live tidak diarahkan — probe health `127.0.0.1:8000` menjawab `401`, bukan `osc_rest`; seluruh test live SKIP sesuai RoE). Saat audit live dijalankan, terapkan gate berikut bila ada check yang gagal:

1. **`SOC-W1-001` gagal** → middleware osc_rest wajib memvalidasi signature + klaim `scope` per-path (deny-by-default); jangan pernah menerima `alg:none`; pastikan `osc_site` BFF tidak meneruskan cookie challenge ke path non-auth.
2. **`SOC-W1-002` gagal** → simpan `mfa_last_verified_step` atomik (transaksional) per user; tolak `step <= tersimpan` sebelum memverifikasi kode; berikan `429` terpisah agar lockout 15 menit tercatat di `activity_logs`.
3. **`SOC-W1-003/004` gagal** → ambil `active_company_id` HANYA dari baris `user_sessions` (never trust JWT claim); setiap query tenant wajib menyertakan predicate `company_id` (deny bila absent); uji regresi IDOR di `rest_qad/test/regression/`.
4. **`SOC-W1-005` gagal** → pastikan seluruh nilai AST melalui `push_bind` (audit manual `QueryBuilder`), identifier melalui regex `valid_key` + `AssertSqlSafe`, kedalaman/jumlah node divalidasi sebelum translasi.
5. **`SOC-W1-006` gagal** → sanitasi export wajib prefix `'` untuk `= + - @ \t \r` (rust_xlsxwriter, tulis sebagai string); tambahkan unit test di `osc_rest` (sudah ada 46 test — tambah kasus `-2+3||' )`).
6. Seluruh temuan gagal wajib direproduksi sebagai test `regression` di `osc_docs/test/rest_qad/test/regression/` dengan `X-Correlation-ID` (ter-redaksi) sebagai bukti.

Status verifikasi lokal (tanpa stack): `cd osc_docs/test/rest_soc && python3 -m pytest -q` → **16 passed, 31 skipped** (exit 0). Audit live: `docker compose up -d osc_base rustfs osc_rest` + env `SOC_W1_*` → `python3 -m pytest test/wave1 -v`.
