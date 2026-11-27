---
code: MP-AM02-QA
module: AM02 (DCIM & Rack Mapping)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute DCIM 42U Rack Slot Collision & Power Budget Audit Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AM02-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/AM02-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `AM02-F.py`.
2. Validasi pencegahan *Rack Unit Collision* (menolak insersi dua server pada U-slot yang sama).
3. Uji peringatan otomatis ketika total konsumsi daya server melebihi batas *Power Capacity (Watts)* frame rak.

## Acceptance Criteria
- [ ] Validasi penempatan rak server 42U dan budget daya berjalan presisi (PASSED).
- [ ] Documented at `osc_docs/notes/MP-AM02-QA.md`.