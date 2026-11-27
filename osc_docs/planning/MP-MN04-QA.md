---
code: MP-MN04-QA
module: MN04 (Central Alerting & Thresholds)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute MN04 Alert Rules & Deduplication Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/MN04-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/MN04-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/MN04-F.py` untuk menguji evaluasi threshold alert (sliding window).
2. Validasi deduplikasi insiden dan flapping suppression untuk mencegah spam notifikasi.

## Acceptance Criteria
- [ ] Alerting engine dan deduplikasi notifikasi terverifikasi akurat.
- [ ] Documented at `osc_docs/notes/MP-MN04-QA.md`.