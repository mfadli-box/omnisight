---
code: MP-AG01-AG
module: AG01 (MCP Gateway Registry)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: MCP Tool Local Execution Agent & Command Runner in Golang

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/mcp/runner.go && echo "MCP_RUNNER_OK" || echo "MCP_RUNNER_MISSING"
```

## Objective & Scope
1. Terima instruksi eksekusi tool MCP dari Gateway `AG01` via WebSocket terenkripsi.
2. Jalankan perintah diagnostik SRE lokal (misal `systemctl status`, `docker ps`, `df -h`) secara aman dengan batas waktu *timeout* ketat (10 detik).
3. Kembalikan stdout/stderr terformat JSON-RPC ke AI Gateway.

## Acceptance Criteria
- [ ] Perintah tereksekusi aman tanpa celah *arbitrary command injection*.
- [ ] Timeout eksekusi mencegah *hanging process* pada agen.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-AG01-AG.md`