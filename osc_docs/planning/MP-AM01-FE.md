---
code: MP-AM01-FE
module: AM01 (IT Asset & Hardware)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: IT Hardware Asset Inventory Table & Store Account Form Component

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/am/hardware/page.tsx && echo "AM01_EXISTS" || echo "AM01_MISSING"
```

## Objective & Scope
1. Buat tabel inventaris aset hardware (Laptop, Server, POS PC, Telephony) dengan pencarian Serial Number.
2. Tampilkan form pendaftaran akun digital toko (ShopeeFood, GoBiz, GrabMerchant, Gmail).

## Output Deliverables
- `osc_site/src/app/(dashboard)/am/hardware/page.tsx`
- Catatan kerja: `osc_site/notes/MP-AM01-FE.md`