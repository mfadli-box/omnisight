---
code: MP-NP02-QA
module: NP02 (IPAM & Network Source of Truth)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute NP02 IPAM Subnet Calculation & Rogue IP Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/NP02-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/NP02-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/NP02-F.py` untuk memvalidasi kalkulasi subnet CIDR/INET PostgreSQL.
2. Verifikasi deteksi Rogue IP (perangkat asing) dan alokasi IP real-time di `trx_ip_allocation`.

## Acceptance Criteria
- [ ] Kalkulasi subnet dan deteksi Rogue IP berjalan presisi.
- [ ] Documented at `osc_docs/notes/MP-NP02-QA.md`.