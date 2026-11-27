---
code: MP-AM03-AG
module: AM03 (Store Equipment CMDB)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: Store POS Thermal Printer, Scanner & Bank EDC Terminal Diagnostics Agent

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/store/equipment_checker.go && echo "STORE_DIAG_OK" || echo "STORE_DIAG_MISSING"
```

## Objective & Scope
1. Cek konektivitas perangkat kasir toko: POS PC, Thermal Receipt Printer (USB/LAN), Barcode Scanner, dan Mesin EDC Bank (BCA, Mandiri, BRI via LAN/H2H IP).
2. Laporkan status *offline/online* peralatan toko ke `AM03`.

## Acceptance Criteria
- [ ] Kegagalan koneksi EDC Bank atau Printer Kasir terdeteksi dalam rentang waktu < 30 detik.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-AM03-AG.md`