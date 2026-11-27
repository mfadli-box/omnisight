---
code: MP-SD02-FE
module: SD02 (SLA Escalation Manager)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: SLA Countdown Clock Badges & Escalation Breach Dashboard

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/sd/sla-monitor/page.tsx && echo "SD02_EXISTS" || echo "SD02_MISSING"
```

## Objective & Scope
1. Tampilkan badge penanda waktu mundur SLA per tiket (Warna Merah kedip jika `SLA Breached`).
2. Tampilkan chart statistik pencapaian target SLA per perusahaan / cabang toko.

## Output Deliverables
- `osc_site/src/app/(dashboard)/sd/sla-monitor/page.tsx`
- Catatan kerja: `osc_site/notes/MP-SD02-FE.md`