---
code: MP-AM03-BE
module: AM03 (Store Equipment CMDB)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: REST API for Store EDC Payment Terminals & Digital Signage Displays

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/asset/store_cmdb_service.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan REST API registri terminal EDC Bank (BCA, Mandiri, BRI) lengkap dengan nomor TID/MID.
2. Pemetaan jenis koneksi EDC (`LAN`, `H2H`, `Dial-up`) ke mesin Kasir / Self-Service.
3. Kelola registri media player Digital Signage (`BMax`) dan TV display (`Aqua`).

## Acceptance Criteria
- [ ] REST API mengembalikan pemetaan relasi aset toko (`company` -> `area` -> `store`).
- [ ] Mendukung pencarian unit EDC berdasarkan nomor TID / MID.
- [ ] Lolos pengujian `osc_docs/test_flows/AM03-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-AM03-BE.md`