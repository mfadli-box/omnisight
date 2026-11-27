---
code: MP-CM03-QA
module: CM03 (Audit Trail & Log Rotation Engine)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Log Rotation & Retention Policy QA Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/CM03-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/CM03-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `CM03-F.py`.
2. Validasi pembuatan partisi PostgreSQL bulanan (`log_*_yYYYYmMM`) secara otomatis.
3. Verifikasi integrasi skrip `logrotate` OS Ubuntu untuk pengarsipan dan pembersihan log >90 hari.

## Acceptance Criteria
- [ ] Skrip rotasi log 90 hari terverifikasi berjalan tanpa menghapus log aktif.
- [ ] Documented at `osc_docs/notes/MP-CM03-QA.md`.