---
code: MP-SD01-AG
module: SD01 (Incident Ticketing)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Incident Auto-Diagnostic Dump Collector Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/diag/snapshot.go && echo "DIAG_OK" || echo "DIAG_MISSING"
```

## Objective & Scope
1. Ambil snapshot log sistem (`dmesg`, Windows Event Log), daftar proses aktif, dan status jaringan saat tiket insiden dibuat.
2. Lampirkan berkas ringkasan diagnostik (`.tar.gz` / `.zip`) ke tiket insiden `SD01`.

## Acceptance Criteria
- [ ] Berkas diagnostik otomatis terlampir pada tiket insiden untuk membantu analisa SRE.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-SD01-AG.md`