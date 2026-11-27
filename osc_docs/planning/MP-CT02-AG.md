---
code: MP-CT02-AG
module: CT02 (Container Terminal, Logs & Image Management)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: Host TTY Shell Relay & Secure Execution Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/terminal/relay.go && echo "TTY_RELAY_EXISTS" || echo "TTY_RELAY_MISSING"
```

## Objective & Scope
1. Fasilitasi WebSocket TTY relay untuk eksekusi perintah shell terkontrol pada host node.
2. Batasi eksekusi dengan `namespaces` / `cgroups` pada Linux dan Job Objects pada Windows.
3. Kirimkan stream `stdout`/`stderr` ke WebSocket backend secara *chunked*.

## Acceptance Criteria
- [ ] Terminal interaktif dapat diakses dengan *latency* minimal.
- [ ] Perintah `rm -rf /` atau pemformatan disk terintersepsi dan diblokir lokal.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-CT02-AG.md`