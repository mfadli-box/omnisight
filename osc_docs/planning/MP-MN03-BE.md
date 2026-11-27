---
code: MP-MN03-BE
module: MN03 (SNMP Poller Engine)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: SNMP v2c/v3 Async Poller Service & Network Switch Interface Metrics

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/telemetry/snmp_poller.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan engine poller SNMP v2c/v3 untuk membaca OID standar (CPU, Memory, Interface Bandwidth).
2. Dekode SNMP PDU dan enkripsi string *community / USM credentials* (`community_encrypted`).
3. Simpan snapshot trafik port jaringan ke partisi `log_snmp_telemetry`.

## Acceptance Criteria
- [ ] Berhasil mendekode response SNMP tanpa *memory leak*.
- [ ] Menyimpan metrik port interface per server/switch secara teratur.
- [ ] Lolos pengujian `osc_docs/test_flows/MN03-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-MN03-BE.md`