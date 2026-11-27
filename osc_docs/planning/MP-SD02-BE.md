---
code: MP-SD02-BE
module: SD02 (SLA Escalation Manager)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Automated SLA Breach Monitor & Incident Escalation Engine

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/sd/sla_monitor.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat background worker pemantau durasi penanganan tiket berdasarkan matriks `dat_sla_policy`.
2. Deteksi potensi penundaan (*SLA Warning*) dan pemicu insiden terlampaui (*SLA Breached*).
3. Eksekusi eskalasi penugasan tiket secara otomatis ke jenjang manajemen yang lebih tinggi (`escalation_level`).

## Acceptance Criteria
- [ ] Worker memperbarui status `is_sla_breached = TRUE` secara tepat waktu saat batas respon terlampaui.
- [ ] Mengirimkan notifikasi eskalasi insiden ke penanggung jawab berikutnya.
- [ ] Lolos pengujian `osc_docs/test_flows/SD02-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-SD02-BE.md`