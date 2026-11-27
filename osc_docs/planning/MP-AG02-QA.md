---
code: MP-AG02-QA
module: AG02 (Directus Work Log & AI Reporting)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Directus Headless CMS Sync & Token Security Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AG02-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/AG02-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/AG02-F.py > /dev/null 2>&1 && echo "FLOW_PASSED" || echo "FLOW_FAILED"
python3 -m unittest osc_docs/test_guard/AG02-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Eksekusi `AG02-F.py` & `AG02-G.py`.
2. Validasi registrasi laporan markdown `osc_note/` ke `trx_ai_work_log`, worker antrean sync `trx_directus_sync_queue`, dan audit konsumsi token di `log_ai_execution_audit`.
3. Verifikasi enkripsi token statis Directus (`static_token_enc`) berbasis AES-256-GCM dan sanitasi payload laporan.

## Acceptance Criteria
- [ ] Sinkronisasi CMS Directus dan keamanan token terverifikasi 100% (PASSED).
- [ ] Documented at `osc_docs/notes/MP-AG02-QA.md`.