---
code: MP-AM02-QA
module: AM02 (DCIM & Rack Mapping)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute AM02 42U Rack Collision & Power Audit Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AM02-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/AM02-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/AM02-F.py` untuk memvalidasi pencegahan *Rack Unit Collision* pada slot U1-U42.
2. Uji peringatan otomatis saat konsumsi daya server melebihi batas *Power Capacity (Watts)* rack PDU.

## Acceptance Criteria
- [ ] Validasi penempatan U-slot rak server 42U dan budget daya berjalan presisi.
- [ ] Documented at `osc_docs/notes/MP-AM02-QA.md`.