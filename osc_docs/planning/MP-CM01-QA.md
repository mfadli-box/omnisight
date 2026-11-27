---
code: MP-CM01-QA
module: CM01 (Identity, Access & HRIS Auth Sync)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute CM01 QA & Security Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/CM01-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/CM01-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/CM01-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/CM01-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/CM01-F.py` untuk menguji 7 skenario utama: Argon2id Local Auth, HRIS XML Parsing, Auto-Sync Backup Password, HRIS Rejection, Fallback Recovery Mode, TOTP MFA, dan JWT Token.
2. Buat skrip `osc_docs/test_guard/CM01-G.py` untuk menguji proteksi XXE DTD Expansion & SSRF pada HTTP Client HRIS.

## Acceptance Criteria
- [ ] Seluruh skenario pengujian fungsional dan keamanan auth 100% PASSED.
- [ ] Documented at `osc_docs/notes/MP-CM01-QA.md`.