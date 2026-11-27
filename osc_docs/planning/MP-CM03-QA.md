---
code: MP-CM03-QA
module: CM03 (Audit Trail & Log Rotation Engine)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute CM03 Log Rotation & Audit Trail Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/CM03-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/CM03-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/CM03-F.py` untuk menguji pembuatan partisi PostgreSQL bulanan (`log_*_yYYYYmMM`).
2. Validasi penulisan entri ke `trx_audit_trail` serta eksekusi rotasi log 90 hari OS `logrotate`.

## Acceptance Criteria
- [ ] Rotasi partisi log bulanan dan audit trail terverifikasi berjalan lancar.
- [ ] Documented at `osc_docs/notes/MP-CM03-QA.md`.