---
code: MP-AM02-FE
module: AM02 (DCIM & Rack Mapping)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: 42U Server Rack Unit Drag-and-Drop Visualizer Component

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/am/dcim-racks/page.tsx && echo "AM02_EXISTS" || echo "AM02_MISSING"
```

## Objective & Scope
1. Buat komponen diagram visual rak server 42U (`RackVisualizer.tsx`) menampilkan posisi server (1U, 2U, 4U).
2. Tampilkan pengukur konsumsi daya (Watt) dan beban suhu panas rak server Data Center.

## Output Deliverables
- `osc_site/src/app/(dashboard)/am/dcim-racks/page.tsx` & `RackVisualizer.tsx`
- Catatan kerja: `osc_site/notes/MP-AM02-FE.md`