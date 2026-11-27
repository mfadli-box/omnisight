---
code: MP-AG02-QA
module: AG02 (Directus Work Log & AI Reporting)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute AG02 Directus CMS Sync & Token Security Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AG02-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/AG02-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/AG02-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/AG02-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/AG02-F.py` untuk menguji registrasi laporan markdown `osc_note/` ke antrean Directus CMS.
2. Buat skrip `osc_docs/test_guard/AG02-G.py` untuk memvalidasi enkripsi AES-256-GCM token statis Directus.

## Acceptance Criteria
- [ ] Sinkronisasi laporan kerja AI ke Directus CMS berjalan aman dan lancar.
- [ ] Documented at `osc_docs/notes/MP-AG02-QA.md`.