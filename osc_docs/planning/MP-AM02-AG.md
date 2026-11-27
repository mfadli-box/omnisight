---
code: MP-AM02-AG
module: AM02 (DCIM & Rack Mapping)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: medium
token_optimization: true
---
# Task: IPMI Thermal Sensor & Power Consumption Collector Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/dcim/ipmi_collector.go && echo "IPMI_OK" || echo "IPMI_MISSING"
```

## Objective & Scope
1. Kumpulkan data sensor suhu CPU (°C), kecepatan kipas (RPM), dan konsumsi daya Watt dari interface IPMI / OpenBMC.
2. Teruskan data telemetri fisik server ke module DCIM `AM02`.

## Acceptance Criteria
- [ ] Peringatan overheat (> 85°C) terkirim secara instan ke backend.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-AM02-AG.md`