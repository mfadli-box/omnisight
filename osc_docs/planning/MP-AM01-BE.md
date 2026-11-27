---
code: MP-AM01-BE
module: AM01 (IT Asset Inventory)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: REST API for Store POS Hardware, Telephony & Encrypted Account Vault

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/asset/hardware_service.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan endpoint CRUD manajemen hardware POS, PC, Printer, dan HP Operasional Store.
2. Enkripsi kredensial password akun merchant (ShopeeFood, Grab, GoBiz) dengan AES-256-GCM.
3. Hitung depresiasi nilai buku aset berbasis metode garis lurus (*straight-line depreciation*).

## Acceptance Criteria
- [ ] Endpoint mengembalikan struktur data inventaris aset toko secara teratur.
- [ ] Password merchant tersimpan dan terdekripsi dengan aman via otorisasi hak akses.
- [ ] Lolos pengujian `osc_docs/test_flows/AM01-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-AM01-BE.md`