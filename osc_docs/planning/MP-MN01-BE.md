---
code: MP-MN01-BE
module: MN01 (Lightweight Agent Metrics)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Metrics Telemetry Ingest REST Endpoint & HMAC SHA-256 Authentication

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/telemetry/ingest_handler.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat endpoint ingest `POST /api/v1/telemetry/agent` untuk menerima payload CPU, RAM, Disk, Net I/O dari agen `osc_auto`.
2. Validasi HTTP Header `X-Agent-Signature` menggunakan HMAC SHA-256 berbasis `hmac_secret_encrypted`.
3. Tuliskan data telemetri ke tabel berpartisi bulanan `log_agent_telemetry`.

## Acceptance Criteria
- [ ] Menolak payload dengan signature HMAC invalid (HTTP 401 Unauthorized).
- [ ] Menyimpan batch data telemetri dengan throughput tinggi di database.
- [ ] Lolos pengujian `osc_docs/test_flows/MN01-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-MN01-BE.md`