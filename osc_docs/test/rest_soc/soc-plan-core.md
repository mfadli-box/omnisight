# SOC Security Verification Plan: Core Foundation (Headers & Error Surface)

- **Date**: 2026-11-11
- **Author**: ai-test (SOC Security Engineer)
- **Workspace**: `osc_docs/test/rest_soc`
- **Security Test Suite Location**: `osc_docs/test/rest_soc/test/{unit,soc}/`
- **Target API / Spec Reference**: `osc_docs/rest/api-core-foundation.md` (§2 endpoint, §5 security controls)

## 1. Threat Model & Attack Surface

- **Permukaan saat ini**: `GET /api/v1/health` (public) + fallback router (404) + method router (405). Auth/Excel/RustFS belum ada — vektor lanjutan disiapkan sebagai data, dijalankan pada fasenya.
- **Ancaman fokus fondasi**: misconfiguration security header (API7:2023), kebocoran detail internal pada respons error (API8:2023 / CWE-209), dan persiapan vektor injection/upload/auth untuk fase berikutnya.
- **Rules of Engagement**: hanya request GET/PUT deterministik, jumlah terbatas (`SOC_MAX_REQUESTS_PER_TEST` default 20), non-destruktif, target default `127.0.0.1:8000` via env, dan **gate sidik jari target** — audit tidak pernah dikirim ke layanan yang bukan `osc_rest` (terbukti perlu: port host `8000` dipegang docker-proxy container Laravel/nginx asing yang menjawab 401/302).
- Aktifasi vektor aktif (fuzz massal/brute) terkunci di belakang `SOC_ALLOW_ACTIVE_ATTACKS` (default `false`).

## 2. Clean Architecture Security Suite Structure

- `src/domain/` — `findings.py` (`SecurityFinding` dengan `passed/severity`, `Severity` INFO..CRITICAL, `AuditEvidence` ter-redaksi), `errors.py`, `gateways.py` (`SecurityClient` Protocol). Zero import httpx/pytest/OS.
- `src/application/` — `exploit_vectors.py` (data murni: 5 SQLi, 4 path traversal, 5 Excel formula injection, 4 magic bytes palsu `.xlsx`, builder JWT `alg:none` dengan override klaim, oversized payload), `header_audit.py` (`audit_security_headers()` → 5 kontrol; `scan_information_leakage()` → pemindai CWE-209).
- `src/infrastructure/` — `config.py` (`SocTargetConfig` + RoE flags dari env), `security_client.py` (httpx: `follow_redirects=False`, `trust_env=False`, whitelist method, bukti ter-redaksi), `evidence.py` (redaksi `authorization/cookie/set-cookie/x-api-key` → `<redacted>` + `JsonEvidenceReporter`).
- `test/` — marker `@pytest.mark.soc|headers|info_leak|injection|idor|auth_bypass|file_upload_abuse|rate_limit|unit`; gate `require_target` skip bila target mati/bukan osc_rest.

## 3. Security Control & Attack Matrix

| Check ID | OWASP / CWE Category | Attack Vector Tested | Expected Defense | Result |
| :--- | :--- | :--- | :--- | :--- |
| `SOC-H01` | API7:2023 / CWE-693 | Inspeksi `X-Content-Type-Options` | `nosniff` | Pass (unit) / Pending (live) |
| `SOC-H02` | API7:2023 / CWE-693 | Inspeksi `X-Frame-Options` | `DENY` (nilai lain → gagal) | Pass (unit) / Pending (live) |
| `SOC-H03` | API7:2023 / CWE-693 | Inspeksi `Referrer-Policy` | `no-referrer` | Pass (unit) / Pending (live) |
| `SOC-H04` | API7:2023 / CWE-693 | Inspeksi `Cache-Control` | `no-store` | Pass (unit) / Pending (live) |
| `SOC-H05` | API7:2023 / CWE-1021 | Inspeksi `Content-Security-Policy` | memuat `default-src 'none'` (API-only) | Pass (unit) / Pending (live) |
| `SOC-L01` | API8:2023 / CWE-209 | Pemindaian body: stack trace `.rs:`, `sqlx`, `SELECT * FROM`, `postgres://`, `rustfs` | body bersih; `panic`/SQL/bucket tidak pernah bocor | Pass (unit) / Pending (live) |
| `SOC-L03` | API8:2023 / CWE-209 | Path tak dikenal `__soc_probe_nonexistent__` | ≠ 200 & tanpa detail internal | Pass (unit) / Pending (live) |
| `SOC-L04` | API7:2023 / CWE-693 | `PUT` pada endpoint GET-only | `405` & body bersih | Pass (unit) / Pending (live) |
| `SOC-P01` *(rencana)* | API2:2023 / CWE-347 | JWT `alg:none` + tanda tangan di-tamper | `401 UNAUTHORIZED` | Pending (fase auth) |
| `SOC-P02` *(rencana)* | API1:2023 (IDOR) | Akses resource lintas user/tenant | `403/404` | Pending (fase fitur users) |
| `SOC-P03` *(rencana)* | Web A03 / CWE-1236 | Upload `.xlsx` formula injection (`=cmd\|...`) & magic bytes palsu | `400` + sanitasi; `413` untuk oversized | Pending (fase excel) |
| `SOC-P04` *(rencana)* | Web A03 / CWE-22 | Path traversal pada object key RustFS / filename | `400/404`, tidak keluar base dir | Pending (fase excel/storage) |
| `SOC-P05` *(rencana)* | API4:2023 | Flood melewati batas rate | `429 RATE_LIMITED` | Pending (fase auth `tower-governor`) |

> Vektor `SOC-P01..P05` sudah tersedia sebagai data murni di `src/application/exploit_vectors.py` dan terunit-tes; eksekusi live menyusul saat fitur terkait hidup.

## 4. Remediation & Hardening Recommendations

- Seluruh kontrol yang teruji pada fondasi diekspektasikan **lulus** saat stack hidup — header dipasang middleware `security_headers.rs` dan masking error oleh `AppError::internal()` (fase ai-rest). Bila `SOC-H*`/`SOC-L*` gagal live → periksa middleware header & masking error di `osc_rest` terlebih dahulu.
- Rekomendasi per fase: rate limit `tower-governor` (auth), sanitasi formula Excel + verifikasi magic bytes ZIP + batas multipart (excel), CORS ketat + RBAC extractor (auth), izin file state/queue `0600` bila offline buffering diaktifkan.
- Eksekusi:

```bash
cd osc_docs/test/rest_soc
python3 -m pytest -v        # unit (14) selalu jalan; audit live skip bila target tak cocok
```
