---
code: MP-MN01-QA
module: MN01 (Lightweight Agent Metrics - Golang)
owner: ai-docs
target_model: gpt-6.2-astra
reasoning_effort: low
token_optimization: true
---
# Task: Execute Agent HMAC SHA-256 Signature Validation Test Suite

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_docs/test_guard/MN01-G.py && echo "TEST_EXISTS" || echo "TEST_MISSING"
python3 -m unittest osc_docs/test_guard/MN01-G.py > /dev/null 2>&1 && echo "ALL_TESTS_PASSED" || echo "TESTS_FAILED"
```

## Objective & Scope
1. Eksekusi `MN01-G.py`.
2. Validasi autentikasi payload telemetri dari `osc_auto` menggunakan HMAC SHA-256 header (`X-Agent-Signature`).
3. Uji penolakan request dengan signature tidak valid, replay attack (timestamp usang > 5 menit), atau payload terdistorsi.

## Acceptance Criteria
- [ ] Mencegah pemalsuan telemetri agen (Replay & Tampering Attack) 100% PASSED.
- [ ] Documented at `osc_docs/notes/MP-MN01-QA.md`.