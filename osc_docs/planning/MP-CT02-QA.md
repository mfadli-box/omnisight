---
code: MP-CT02-QA
module: CT02 (Container Terminal & Logs)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute CT02 WebSocket Terminal & TTY Audit Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/CT02-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/CT02-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/CT02-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/CT02-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/CT02-F.py` untuk stress test koneksi WebSocket TTY interactive shell `xterm.js`.
2. Buat skrip `osc_docs/test_guard/CT02-G.py` untuk memvalidasi audit log perintah berbahaya (`log_container_exec_audit`).

## Acceptance Criteria
- [ ] Streaming TTY stabil dan deteksi perintah berbahaya terverifikasi PASSED.
- [ ] Documented at `osc_docs/notes/MP-CT02-QA.md`.