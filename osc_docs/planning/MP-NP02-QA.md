---
code: MP-NP02-QA
module: NP02 (IPAM & Network Source of Truth)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute IPAM Subnet Calculation & Rogue Device Detection Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/NP02-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/NP02-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `NP02-F.py`.
2. Validasi manipulasi subnet CIDR/INET PostgreSQL (cek IP overlap & validasi gateway).
3. Verifikasi deteksi *Rogue IP* (perangkat yang terhubung tanpa registrasi resmi) dan penandaan status `STALE`/`RESERVED`.

## Acceptance Criteria
- [ ] Kalkulasi subnet & deteksi perangkat asing berjalan presisi (PASSED).
- [ ] Documented at `osc_docs/notes/MP-NP02-QA.md`.