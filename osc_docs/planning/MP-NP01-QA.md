---
code: MP-NP01-QA
module: NP01 (Nginx Reverse Proxy, Domain & SSL Manager)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Nginx Configuration Generator Syntax Check & Security Header Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/NP01-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/NP01-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `NP01-F.py`.
2. Validasi sintaks berkas `.conf` Nginx yang dihasilkan oleh backend Rust.
3. Verifikasi penyisipan header keamanan wajib (HSTS, X-Frame-Options, SSL TLSv1.2+) dan pencatatan audit reload ke `log_nginx_reload_audit`.

## Acceptance Criteria
- [ ] Konfigurasi VHost Nginx valid tanpa error sintaks dan audit reload terrekam (PASSED).
- [ ] Documented at `osc_docs/notes/MP-NP01-QA.md`.