---
code: MP-SE01-QA
module: SE01 (Privileged Access PAM & Bastion Terminal)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute PAM Key Vault Encryption & SSH Anti-Leak Security Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_guard/SE01-G.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_guard/SE01-G.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `SE01-G.py`.
2. Validasi enkripsi AES-256-GCM pada Kunci SSH Privat & Password RDP di `dat_pam_credential`.
3. Verifikasi bahwa kunci privat asli tidak pernah terlepas dalam plain text melalui API response atau log aplikasi (Anti-Leak Check).

## Acceptance Criteria
- [ ] Enkripsi PAM Vault aman dan tidak ada kebocoran kunci privat (PASSED).
- [ ] Documented at `osc_docs/notes/MP-SE01-QA.md`.