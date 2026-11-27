---
code: MP-SE02-QA
module: SE02 (SIEM, Threat Detection & Compliance Guard)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute WAF Attack Rules (SQLi & XXE) Detection Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_guard/SE02-G.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_guard/SE02-G.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `SE02-G.py`.
2. Simulasikan payload serangan SQL Injection, XXE, Path Traversal, dan Command Injection.
3. Pastikan WAF interceptor memblokir request (HTTP 400/403) dan mencatat insiden ke `log_security_guard` dengan `action_taken = 'BLOCKED'`.

## Acceptance Criteria
- [ ] Deteksi & pemblokiran ancaman WAF 100% PASSED.
- [ ] Documented at `osc_docs/notes/MP-SE02-QA.md`.