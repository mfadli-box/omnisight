---
code: MP-AM01-QA
module: AM01 (IT Asset & Hardware/License Inventory)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute AM01 Asset Depreciation & Account Vault Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AM01-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/AM01-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/AM01-F.py` untuk menguji formula depresiasi nilai aset TI (Straight Line).
2. Memvalidasi enkripsi AES-256-GCM pada password akun merchant toko (`dat_store_account`).

## Acceptance Criteria
- [ ] Depresiasi aset terhitung akurat dan enkripsi akun merchant aman.
- [ ] Documented at `osc_docs/notes/MP-AM01-QA.md`.