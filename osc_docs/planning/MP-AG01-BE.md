---
code: MP-AG01-BE
module: AG01 (MCP Gateway Registry)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: MCP Gateway Server, Tool Router & JSON-RPC WebSocket Handler in Rust

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/mcp/router.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan autentikasi API Key Hash untuk AI Agent Client (`dat_mcp_client`).
2. Sediakan WebSocket/SSE Server (`/ws/v1/mcp/connect`) untuk eksekusi JSON-RPC protocol (`tools/list` & `tools/call`).
3. Validasi argumen masukan terhadap JSON Schema (`dat_mcp_tool`) dan catat audit di `log_mcp_execution`.

## Acceptance Criteria
- [ ] Berhasil me-route panggilan tool AI ke backend service yang sesuai.
- [ ] Menolak perintah berbahaya (`is_destructive = TRUE`) tanpa otorisasi tingkat tinggi.
- [ ] Lolos pengujian `osc_docs/test_flows/AG01-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-AG01-BE.md`