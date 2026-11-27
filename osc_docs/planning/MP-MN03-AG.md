---
code: MP-MN03-AG
module: MN03 (Enterprise Infrastructure & SNMP Poller)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: Golang SNMP v2c/v3 Poller & Device Discovery Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/snmp/poller.go && echo "SNMP_OK" || echo "SNMP_MISSING"
```

## Objective & Scope
1. Gunakan `gosnmp/gosnmp` untuk polling OID standar (sysUpTime, ifInOctets, ifOutOctets, cpuUsage).
2. Dekode SNMP PDU response dari Router/Switch/UPS lokal dan kirimkan metrik ke `osc_rest`.

## Acceptance Criteria
- [ ] Polling SNMP v2c (Community String) dan v3 (USM AuthPriv) berjalan tanpa kebocoran *goroutine*.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-MN03-AG.md`