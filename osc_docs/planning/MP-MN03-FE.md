---
code: MP-MN03-FE
module: MN03 (SNMP & Infrastructure)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Interactive Network Topology Graph & SNMP Device Inspector

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/mn/snmp-topology/page.tsx && echo "MN03_EXISTS" || echo "MN03_MISSING"
```

## Objective & Scope
1. Visualisasikan peta topologi jaringan menggunakan React Flow / Cytoscape.js.
2. Tampilkan modal inspeksi metrik antarmuka router/switch (Interface Octets In/Out, Packet Errors).

## Output Deliverables
- `osc_site/src/app/(dashboard)/mn/snmp-topology/page.tsx`
- Catatan kerja: `osc_site/notes/MP-MN03-FE.md`