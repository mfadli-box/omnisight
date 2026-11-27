---
code: MP-CT02-QA
module: CT02 (Container Terminal, Logs & Image Management)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute WebSocket Terminal Stress Test & TTY Audit Guard Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/CT02-F.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_flows/CT02-F.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `CT02-F.py`.
2. Uji kestabilan koneksi WebSocket TTY interactive shell `xterm.js` under heavy load.
3. Verifikasi pencatatan audit log perintah terminal ke `log_container_exec_audit` beserta penandaan `is_flagged_danger = TRUE` untuk perintah berisiko tinggi (`rm -rf`, `mkfs`).

## Acceptance Criteria
- [ ] WebSocket TTY stabil dan audit log terrekam lengkap dengan flag keamanan.
- [ ] Documented at `osc_docs/notes/MP-CT02-QA.md`.