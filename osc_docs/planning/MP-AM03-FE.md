---
code: MP-AM03-FE
module: AM03 (Store Equipment CMDB)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Store Payment EDC Terminal Cards & DigiSign Player Registry UI

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/am/store-assets/page.tsx && echo "AM03_EXISTS" || echo "AM03_MISSING"
```

## Objective & Scope
1. Tampilkan kartu inventaris terminal EDC Bank (BCA, Mandiri, BRI) per kasir toko.
2. Sediakan panel status pemutar DigiSign (`BMax`) dan TV Display (`Aqua`).

## Output Deliverables
- `osc_site/src/app/(dashboard)/am/store-assets/page.tsx`
- Catatan kerja: `osc_site/notes/MP-AM03-FE.md`