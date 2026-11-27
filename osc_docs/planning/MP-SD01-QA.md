---
code: MP-SD01-QA
module: SD01 (Incident Ticketing & Ticket Management)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute SD01 Ticket Workflow & Stored XSS Guard Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/SD01-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/SD01-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/SD01-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/SD01-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/SD01-F.py` untuk menguji transisi status tiket (`OPEN` -> `RESOLVED`) & histori `trx_ticket_history`.
2. Buat skrip `osc_docs/test_guard/SD01-G.py` untuk menguji sanitasi Stored XSS pada komentar tiket.

## Acceptance Criteria
- [ ] Workflow insiden tiket dan keamanan Stored XSS 100% PASSED.
- [ ] Documented at `osc_docs/notes/MP-SD01-QA.md`.