---
code: MP-MN03-QA
module: MN03 (Enterprise Infrastructure & SNMP Poller Engine)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute SNMP PDU Decoder & USM Credentials Security Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/MN03-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/MN03-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `MN03-F.py`.
2. Validasi parsing paket PDU SNMP v2c & SNMP v3 (USM Auth/Priv).
3. Verifikasi enkripsi kredensial SNMP community string & passphrase pada `dat_snmp_device`.

## Acceptance Criteria
- [ ] Engine poller SNMP memuat data metrik jaringan tanpa kesalahan parsing (PASSED).
- [ ] Documented at `osc_docs/notes/MP-MN03-QA.md`.