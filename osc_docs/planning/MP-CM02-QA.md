---
code: MP-CM02-QA
module: CM02 (Tenant & Master Data Management)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Multi-Tenant Authorization Isolation QA Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/CM02-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/CM02-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi pengujian isolasi tenant (`CM02-F.py`).
2. Validasi pencegahan *Cross-Tenant Data Leakage* pada query `company_id` & `area_id`.
3. Verifikasi pemblokiran HTTP 403 Forbidden saat user mencoba mengakses resource tenant lain.

## Acceptance Criteria
- [ ] Isolasi multi-tenant 100% tervalidasi dan PASSED.
- [ ] Documented at `osc_docs/notes/MP-CM02-QA.md`.