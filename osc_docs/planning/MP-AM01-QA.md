---
code: MP-AM01-QA
module: AM01 (IT Asset & Hardware/License Inventory)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Hardware Asset Depreciation & Encrypted Credential Vault Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AM01-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/AM01-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `AM01-F.py`.
2. Validasi kalkulasi depresiasi nilai buku aset TI (metode Garis Lurus / Straight Line).
3. Verifikasi enkripsi AES-256-GCM pada password akun merchant toko (`dat_store_account`).

## Acceptance Criteria
- [ ] Formula kalkulasi depresiasi presisi dan enkripsi password merchant aman (PASSED).
- [ ] Documented at `osc_docs/notes/MP-AM01-QA.md`.