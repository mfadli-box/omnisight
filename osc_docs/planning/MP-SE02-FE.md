---
code: MP-SE02-FE
module: SE02 (SIEM & Threat Guard)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: SIEM Security Incident Feed & WAF Threat Map Visualizer

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/se/threat-guard/page.tsx && echo "SE02_EXISTS" || echo "SE02_MISSING"
```

## Objective & Scope
1. Tampilkan feed insiden keamanan real-time (SQLi, XXE, Brute-force attempt).
2. Sediakan toggle switch aturan WAF dan peta geolokasi asal IP penyerang.

## Output Deliverables
- `osc_site/src/app/(dashboard)/se/threat-guard/page.tsx`
- Catatan kerja: `osc_site/notes/MP-SE02-FE.md`