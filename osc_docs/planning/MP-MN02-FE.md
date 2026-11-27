---
code: MP-MN02-FE
module: MN02 (Synthetic Uptime & SSL)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Uptime Endpoint Status Cards & SSL Expiry Warning Banner

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/mn/uptime/page.tsx && echo "MN02_EXISTS" || echo "MN02_MISSING"
```

## Objective & Scope
1. Buat halaman pemantauan Uptime & SSL (`/mn/uptime/page.tsx`).
2. Sajikan status ketersediaan 24j/30hr dalam bentuk bar latency & badge warna status (Green 200 OK, Red Failed).
3. Tampilkan banner peringatan untuk sertifikat SSL yang akan kedaluwarsa (<30 hari).

## Output Deliverables
- `osc_site/src/app/(dashboard)/mn/uptime/page.tsx`
- Catatan kerja: `osc_site/notes/MP-MN02-FE.md`