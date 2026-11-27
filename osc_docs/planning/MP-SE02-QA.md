---
code: MP-SE02-QA
module: SE02 (SIEM, Threat Detection & Security Guard)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute SE02 WAF Attack Rules & SIEM Audit Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_guard/SE02-G.py && echo "TEST_WAF_OK" || echo "TEST_WAF_MISSING"
test -s osc_docs/test_guard/SE02-O.py && echo "TEST_OWASP_OK" || echo "TEST_OWASP_MISSING"
python3 -m unittest osc_docs/test_guard/SE02-G.py > /dev/null 2>&1 && echo "WAF_PASSED" || echo "WAF_FAILED"
python3 -m unittest osc_docs/test_guard/SE02-O.py > /dev/null 2>&1 && echo "OWASP_PASSED" || echo "OWASP_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_guard/SE02-G.py` untuk menguji pemblokiran payload SQLi, XXE, XSS, Path Traversal.
2. Buat skrip `osc_docs/test_guard/SE02-O.py` untuk scanning compliance OWASP Top 10.

## Acceptance Criteria
- [ ] Pemblokiran ancaman WAF 100% PASSED dan insiden dicatat di `log_security_guard`.
- [ ] Documented at `osc_docs/notes/MP-SE02-QA.md`.