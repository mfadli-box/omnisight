---
code: MP-AM03-QA
module: AM03 (Store Equipment CMDB)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Store Telephony, EDC & DigiSign CMDB Integration Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AM03-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/AM03-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `AM03-F.py`.
2. Validasi query relasi CMDB multi-store: `dat_company` -> `dat_area` -> `dat_store` -> `dat_store_edc` / `dat_store_pos`.
3. Verifikasi konsistensi data EDC Bank (BCA, Mandiri, BRI) dan pemetaan terminal kasir (`CASHIER 1`, `SS`).

## Acceptance Criteria
- [ ] Query CMDB Toko terintegrasi sempurna tanpa kebocoran data antar-area (PASSED).
- [ ] Documented at `osc_docs/notes/MP-AM03-QA.md`.