---
code: MP-NP02-AG
module: NP02 (IPAM & Network Map)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: Local ARP Table Scanner & Rogue IP Discovery Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/ipam/arp_scanner.go && echo "ARP_SCANNER_OK" || echo "ARP_SCANNER_MISSING"
```

## Objective & Scope
1. Baca tabel ARP/NDP kernel OS host untuk memetakan pasangan IP Address vs MAC Address pada subnet lokal.
2. Identifikasi perangkat tidak dikenal (*Rogue Devices*) yang aktif di jaringan dan laporkan ke IPAM `NP02`.

## Acceptance Criteria
- [ ] Pemindaian subnet `/24` selesai < 5 detik dengan konsumsi resource CPU minimal.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-NP02-AG.md`