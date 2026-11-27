---
code: MP-MN02-QA
module: MN02 (Synthetic Uptime & SSL Checker)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute MN02 Synthetic Uptime & SSL Expiry Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/MN02-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/MN02-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/MN02-F.py` untuk memvalidasi probe ketersediaan target (HTTP, TCP, Ping).
2. Menguji pemicu peringatan otomatis ketika masa berlaku sertifikat SSL mendekati threshold kedaluwarsa.

## Acceptance Criteria
- [ ] Healthcheck target dan SSL warning trigger terbukti presisi.
- [ ] Documented at `osc_docs/notes/MP-MN02-QA.md`.