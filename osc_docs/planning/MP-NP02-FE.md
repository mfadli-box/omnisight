---
code: MP-NP02-FE
module: NP02 (IPAM & Network Map)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Interactive IPAM Subnet Grid Visualizer & IP Allocation Manager

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/np/ipam/page.tsx && echo "NP02_EXISTS" || echo "NP02_MISSING"
```

## Objective & Scope
1. Sajikan kisi visual status IP dalam subnet `/24` (Warna Hijau: Free, Biru: Allocated, Merah: Reserved/Conflict).
2. Tampilkan modal rincian alokasi IP (MAC Address, Hostname Perangkat, Server/Store Assignee).

## Output Deliverables
- `osc_site/src/app/(dashboard)/np/ipam/page.tsx`
- Catatan kerja: `osc_site/notes/MP-NP02-FE.md`