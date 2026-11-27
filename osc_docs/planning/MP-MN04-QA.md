---
code: MP-MN04-QA
module: MN04 (Central Alerting, Thresholds & Escalation Matrix)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Alert Engine Thresholds & Incident Deduplication Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/MN04-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/MN04-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `MN04-F.py`.
2. Validasi evaluasi ambang batas alert (sliding window & flapping suppression).
3. Verifikasi mekanisme deduplikasi insiden agar notifikasi tidak terpesan secara berulang (*alert storm prevention*).

## Acceptance Criteria
- [ ] Evaluasi alert dan deduplikasi notifikasi terverifikasi akurat (PASSED).
- [ ] Documented at `osc_docs/notes/MP-MN04-QA.md`.