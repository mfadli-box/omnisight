---
code: MP-CM02-QA
module: CM02 (Tenant & Master Data Governance)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute CM02 Multi-Tenant Data Isolation Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/CM02-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/CM02-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/CM02-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/CM02-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/CM02-F.py` untuk memvalidasi isolasi data `company_id` & `area_id` pada query API.
2. Buat skrip `osc_docs/test_guard/CM02-G.py` untuk memastikan penolakan HTTP 403 Forbidden saat user menembus tenant lain.

## Acceptance Criteria
- [ ] Isolasi data multi-tenant dan proteksi RLS 100% PASSED.
- [ ] Documented at `osc_docs/notes/MP-CM02-QA.md`.