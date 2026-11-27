---
code: MP-NP01-QA
module: NP01 (Nginx Reverse Proxy & SSL Manager)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute NP01 Nginx Config & SSL Hardening Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/NP01-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/NP01-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/NP01-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/NP01-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/NP01-F.py` untuk memvalidasi generator sintaks VHost Nginx.
2. Buat skrip `osc_docs/test_guard/NP01-G.py` untuk memverifikasi proteksi SSL injection & header HSTS.

## Acceptance Criteria
- [ ] Konfigurasi VHost valid tanpa error sintaks dan SSL hardening terverifikasi.
- [ ] Documented at `osc_docs/notes/MP-NP01-QA.md`.