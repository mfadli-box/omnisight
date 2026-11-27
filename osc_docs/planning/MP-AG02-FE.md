---
code: MP-AG02-FE
module: AG02 (Directus Work Log)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: AI Work Log Markdown Viewer & Directus Sync Queue Dashboard

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/ag/work-log/page.tsx && echo "AG02_EXISTS" || echo "AG02_MISSING"
```

## Objective & Scope
1. Buat viewer dokumen laporan kerja AI (`osc_note/YYYYMMDD-XXX.md`) dengan penataan format Markdown interaktif.
2. Tampilkan status antrean sinkronisasi Directus CMS (`trx_directus_sync_queue`) beserta tombol paksa "Force Sync".

## Output Deliverables
- `osc_site/src/app/(dashboard)/ag/work-log/page.tsx`
- Catatan kerja: `osc_site/notes/MP-AG02-FE.md`