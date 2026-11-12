# QA & Debugger Test Plan: Core Foundation (Health & Error Framework)

- **Date**: 2026-11-11
- **Author**: ai-test (QA & Debugger Engineer)
- **Workspace**: `osc_docs/test/rest_qad`
- **Test Suite Location**: `osc_docs/test/rest_qad/test/{unit,integration,regression}/`
- **Target API / Spec Reference**: `osc_docs/rest/api-core-foundation.md` (`GET /api/v1/health`, envelope error)

## 1. Test Scope & Root-Cause Context

Fondasi kerangka QA untuk fase bootstrap omnisight: verifikasi kontrak `GET /api/v1/health` (konsistensi status HTTP ↔ status JSON ↔ isi `checks`), tipe konten, idempotensi panggilan beruntun, dan perilaku path tak dikenal — plus infrastruktur test yang siap menerima fase fitur berikutnya (users/auth/excel). Tidak ada bug aktif; dokumen ini adalah **rencana pengujian awal** (baseline) sekaligus laporan fondasi.

Catatan lingkungan penting (temuan saat verifikasi): port host `8000` sudah dijawab **docker-proxy ke container Laravel/nginx asing** (redirect ke `/login`). Karena itu gate `require_target` memverifikasi **sidik jari kontrak** (health harus 200/503 ber-JSON) sebelum mengirim trafik — jika target bukan `osc_rest`, test live **skip** dengan pesan penunjuk `QA_TARGET_BASE_URL`, bukan gagal. Trafik test tidak pernah dikirim ke layanan asing.

## 2. Clean Architecture Test Structure

- `src/domain/` — `models.py` (`TestCaseScenario`, `ApiResponseSnapshot`, `ApiEndpoint`, `EndpointMethod`, `HealthSnapshot`), `errors.py` (`ContractViolationError`, `UnreachableTargetError`), `gateways.py` (`ApiClient` Protocol). **Zero** import `httpx`/`pytest`/OS.
- `src/application/` — `health_contract.py` (skema pydantic `HealthResponseModel` + `evaluate_health_snapshot()` murni + `verify_health_contract()` orkestrasi), `payload_generators.py` (boundary integers, oversized text 1 MiB, whitespace, unicode/NUL, invalid types).
- `src/infrastructure/` — `config.py` (`TargetConfig` dari env — zero hardcoded secret), `http_client.py` (adapter `httpx`: `follow_redirects=False`, `trust_env=False`, snapshot body dibatasi 64 KiB, transport → `UnreachableTargetError`), `reporters.py` (`JsonEvidenceReporter` → `evidence/`, di-gitignore).
- `test/` — `conftest.py` (fixture `target_config`, `api_client`, gate `require_target`), marker `@pytest.mark.unit|integration|regression|contract`; `pyproject.toml` memakai `pythonpath=["src"]`, `--strict-markers`.

## 3. Test Case Matrix

| Test ID | Scenario / Edge Case | Input / Precondition | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| `QA-001` | `boundary_integers` memuat batas [low,high] + di luar + ekstrem int32 | `low=0, high=100` | `{0,1,-1,99,100,101} ⊂ hasil`, min/max `-2^31..2^31-1`, tanpa duplikat | Pass |
| `QA-002` | `oversized_text` panjang presisi; nilai negatif ditolak | `64` / `-1` | `"A"*64` / `ValueError` | Pass |
| `QA-003` | Varian whitespace & string kosong | — | `""`, `" "` ada dalam generator | Pass |
| `QA-004` | Unicode & kontrol (NUL, newline, emoji, RTL) | — | memuat `"\x00"`, tanpa string kosong | Pass |
| `QA-005` | Tipe salah untuk abuse coercion | `None/bool/float/list/dict/int besar` | ada non-string | Pass |
| `QA-006` | Kontrak health `200/ok` | snapshot sintetis valid | `verdict.passed` | Pass |
| `QA-007` | Kontrak health `503/degraded` | snapshot sintetis valid | `verdict.passed` | Pass |
| `QA-008` | Mismatch HTTP ↔ status JSON ditolak | `200` + `status=degraded` | gagal + detail "tidak konsisten" | Pass |
| `QA-009` | Status JSON tidak dikenal ditolak | `status=bogus` | gagal | Pass |
| `QA-010` | `checks` hilang / nilai salah / body non-JSON ditolak | `{"status":"ok"}` dst. | gagal | Pass |
| `QA-011` | Field tambahan masa depan ditoleransi (`extra=allow`) | payload + `uptime` | `passed` | Pass |
| `QA-012` | HTTP di luar kontrak ditolak | `500` + body ok | gagal | Pass |
| `QA-013` | Use case memakai path kontrak `"/api/v1/health"` | `FakeApiClient` | path tercatat tepat | Pass |
| `QA-INT-001` | **Live**: kontrak health penuh | stack hidup, `GET /api/v1/health` | `verdict.passed` | Pending |
| `QA-INT-002` | **Live**: `Content-Type: application/json` | stack hidup | startswith json | Pending |
| `QA-INT-003` | **Live**: idempotensi 2 panggilan beruntun | stack hidup | status & body identik | Pending |
| `QA-INT-004` | **Live**: path tak dikenal ≠ 200 & tanpa panic | stack hidup | `!=200`, tanpa "panicked at" | Pending |
| `QA-REG` | Reproduksi bug minimal (fail→fix→pass) | fase debugging | trace + evidence JSON | Pending |

> Status **Pending** untuk test live menunggu stack `docker compose up -d osc_base rustfs osc_rest` (atau `QA_TARGET_BASE_URL` menunjuk instance osc_rest yang benar). Saat target asing memegang port: hasil **Skipped** oleh gate sidik jari — bukan kegagalan suite.

## 4. Debugging & Reproduction Notes

- Pola regresi (fase berikutnya): letakkan repro minimal di `test/regression/test_<issue>.py` — HARUS gagal sebelum fix dan lulus sesudah fix; lampirkan trace via `JsonEvidenceReporter` (`evidence/*.json`, di-gitignore, secret tidak pernah masuk evidence).
- Eksekusi:

```bash
cd osc_docs/test/rest_qad
python3 -m pytest -v                                   # unit (16) selalu jalan; live skip bila target tak cocok
docker compose up -d osc_base rustfs osc_rest          # dari root workspace
QA_TARGET_BASE_URL=http://127.0.0.1:<port-published> python3 -m pytest -v   # bila port dipublish
```

- Deviasi toolchain: skill menargetkan Python 3.11+; lingkungan menyediakan 3.10.12 — kode ditulis kompatibel 3.10+ (`requires-python = ">=3.10"`), pytest 9.2.0 + httpx 0.28.1 + pydantic 2.14.3 terverifikasi.
