---
code: MP-SD02-AG
module: SD02 (SLA Escalation Manager)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: low
token_optimization: true
---
# Task: Local Host Unreachable & SLA Breach Emergency Notifier Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/sla/host_notifier.go && echo "SLA_NOTIFIER_OK" || echo "SLA_NOTIFIER_MISSING"
```

## Objective & Scope
1. Pantau status koneksi heartbeat agen ke master backend.
2. Jika agen mendeteksi isolasi jaringan lokal, aktifkan rute *failover alert* via SMS Gateway / Secondary Network Interface.

## Acceptance Criteria
- [ ] Notifikasi darurat terkirim via rute *failover* saat link jaringan utama terputus.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-SD02-AG.md`