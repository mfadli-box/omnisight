---
code: MP-MN03-QA
module: MN03 (Enterprise Infrastructure & SNMP)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute MN03 SNMP Poller & USM Credentials Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/MN03-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/MN03-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/MN03-F.py` untuk menguji parsing paket PDU SNMP v2c & v3 (USM Auth/Priv).
2. Memvalidasi enkripsi passphrase dan community string pada `dat_snmp_device`.

## Acceptance Criteria
- [ ] Poller SNMP memuat data metrik jaringan tanpa kesalahan parsing.
- [ ] Documented at `osc_docs/notes/MP-MN03-QA.md`.