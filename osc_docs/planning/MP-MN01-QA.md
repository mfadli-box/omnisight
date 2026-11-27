---
code: MP-MN01-QA
module: MN01 (Lightweight Agent Metrics)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute MN01 Agent HMAC Signature & Ingestion Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/MN01-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/MN01-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/MN01-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/MN01-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/MN01-F.py` untuk menguji penulisan batch metrik telemetri host (CPU, RAM, Disk, Net).
2. Buat skrip `osc_docs/test_guard/MN01-G.py` untuk memvalidasi penolakan signature HMAC invalid & replay attack (>5 menit).

## Acceptance Criteria
- [ ] Validasi autentikasi HMAC dan ingest telemetri 100% PASSED.
- [ ] Documented at `osc_docs/notes/MP-MN01-QA.md`.