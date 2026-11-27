---
code: MP-SE01-QA
module: SE01 (Privileged Access PAM & Bastion Terminal)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute SE01 PAM Vault & SSH Bastion Audit Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/SE01-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/SE01-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/SE01-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/SE01-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/SE01-F.py` untuk menguji audit perekaman sesi Bastion SSH.
2. Buat skrip `osc_docs/test_guard/SE01-G.py` untuk memvalidasi enkripsi AES-256-GCM pada Kunci SSH Privat & Password RDP.

## Acceptance Criteria
- [ ] Vault enkripsi PAM aman dan audit TTY terminal terrekam lengkap.
- [ ] Documented at `osc_docs/notes/MP-SE01-QA.md`.