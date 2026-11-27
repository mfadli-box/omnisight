---
code: MP-AM02-BE
module: AM02 (DCIM & Rack Mapping)
owner: ai-rest
target_model: gpt-6.1-terra
reasoning_effort: high
token_optimization: true
---
# Task: DCIM Server Rack Placement Visualizer & 42U Spatial Unit REST API

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/asset/dcim_service.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat API manajemen posisi server pada Rack Unit 42U (`dat_rack_unit`).
2. Sediakan fungsi validasi konflik penempatan posisi U (*anti-collision spatial check*).
3. Hitung estimasi konsumsi daya listrik (Watt) dan beban berat (kg) per kabinet rack.

## Acceptance Criteria
- [ ] Menolak insersi server jika posisi Unit U yang diminta telah terisi server lain.
- [ ] Mengembalikan peta visual spasial rack dalam format JSON terstruktur.
- [ ] Lolos pengujian `osc_docs/test_flows/AM02-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-AM02-BE.md`