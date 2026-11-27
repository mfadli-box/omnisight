---
code: MP-MN02-QA
module: MN02 (Synthetic Uptime, Ping & SSL Checker)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Synthetic Probe & SSL Expiration Warning QA Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/MN02-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/MN02-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `MN02-F.py`.
2. Validasi probe ketersediaan target (HTTP 200/301, TCP Port, ICMP Ping).
3. Verifikasi pemicu peringatan otomatis ketika masa berlaku sertifikat SSL/TLS mendekati threshold kedaluwarsa (`ssl_warn_days` & `ssl_crit_days`).

## Acceptance Criteria
- [ ] Deteksi Uptime dan pemicu SSL warning berfungsi akurat (PASSED).
- [ ] Documented at `osc_docs/notes/MP-MN02-QA.md`.