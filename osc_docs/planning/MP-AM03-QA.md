---
code: MP-AM03-QA
module: AM03 (Store Equipment CMDB)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute AM03 Store CMDB & EDC Integration Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AM03-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/AM03-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/AM03-F.py` untuk menguji query relasi 5 tabel fisik toko (`dat_store_pos`, `dat_store_edc`, `dat_store_telephony`, `dat_store_account`, `dat_store_digisign`).
2. Validasi konsistensi pemetaan terminal kasir dan pemicu auto-ticket jika perangkat offline.

## Acceptance Criteria
- [ ] Integration query CMDB Toko terverifikasi konsisten dan akurat.
- [ ] Documented at `osc_docs/notes/MP-AM03-QA.md`.