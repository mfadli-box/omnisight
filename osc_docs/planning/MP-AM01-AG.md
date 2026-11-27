---
code: MP-AM01-AG
module: AM01 (IT Asset Inventory)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Hardware Serial Number Auditor & OS License Key Inspector in Golang

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/asset/dmi_auditor.go && echo "DMI_OK" || echo "DMI_MISSING"
```

## Objective & Scope
1. Baca informasi DMI/SMBIOS (Motherboard Serial, RAM Slots, Disk Model, BIOS Version) di Linux & Windows.
2. Inventarisasi perangkat lunak terinstal dan kunci lisensi OS.

## Acceptance Criteria
- [ ] Serial number hardware terekstrak 100% akurat tanpa memerlukan hak akses root berlebihan.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-AM01-AG.md`