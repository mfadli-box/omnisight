---
code: MP-CM01-QA
module: CM01 (Identity, Access & HRIS Auth Sync)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute CM01 QA & Security Test Suite with Fast Pre-Check Guard

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/CM01-F.py && echo "TEST_SCRIPT_OK" || echo "TEST_SCRIPT_MISSING"
python3 osc_docs/test_flows/CM01-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```
- **Jika PASSED**: `STOP & FAST EXIT` ("Pengujian QA & Security CM01 (CM01-F.py) 7/7 PASSED.").
- **Jika FAILED**: Diagnosa & perbaiki handler di `osc_rest`.

## Objective & Scope
1. Eksekusi `python3 CM01-F.py`.
2. Validasi 7 skenario: Argon2id Local Auth, HRIS XML Parsing, Auto-Sync Backup Password, HRIS Rejection (Status 0), Fallback Recovery (>3s), TOTP MFA, dan Anti-XXE/SSRF Protection.

## Acceptance Criteria
- [ ] 7/7 Unit Test PASSED.
- [ ] Documented at `osc_docs/notes/MP-CM01-QA.md`.