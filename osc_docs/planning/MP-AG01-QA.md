---
code: MP-AG01-QA
module: AG01 (MCP Gateway Registry & Tool Routing)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Create & Execute AG01 MCP Tool Routing & Auth Guard Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_flows/AG01-F.py && echo "TEST_FLOWS_OK" || echo "TEST_FLOWS_MISSING"
test -s osc_docs/test_guard/AG01-G.py && echo "TEST_GUARD_OK" || echo "TEST_GUARD_MISSING"
python3 -m unittest osc_docs/test_flows/AG01-F.py > /dev/null 2>&1 && echo "FLOWS_PASSED" || echo "FLOWS_FAILED"
python3 -m unittest osc_docs/test_guard/AG01-G.py > /dev/null 2>&1 && echo "GUARD_PASSED" || echo "GUARD_FAILED"
```

## Objective & Scope
1. Buat skrip `osc_docs/test_flows/AG01-F.py` untuk menguji routing tool MCP dan validasi JSON Schema argumen.
2. Buat skrip `osc_docs/test_guard/AG01-G.py` untuk memverifikasi otorisasi token API Key MCP & interceptor aksi merusak.

## Acceptance Criteria
- [ ] Gateway routing tool MCP terverifikasi fungsional dan terproteksi aman.
- [ ] Documented at `osc_docs/notes/MP-AG01-QA.md`.