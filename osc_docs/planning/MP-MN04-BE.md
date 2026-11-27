---
code: MP-MN04-BE
module: MN04 (Alert Engine & Matrix)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Real-Time Alert Rule Evaluator & Notification Channel Dispatcher

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/alert/evaluator.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat engine evaluasi aturan alert (`dat_alert_rule`) terhadap stream data telemetri.
2. Lakukan deduplikasi insiden berulang (`suppress_duration_min`) dan catat riwayat ke `trx_alert_history`.
3. Kirimkan notifikasi otomatis ke saluran Telegram, Webhook, atau Email API.

## Acceptance Criteria
- [ ] Pemicu alert berfungsi tepat saat ambang batas (*threshold*) terlewati.
- [ ] Notifikasi terkirim dengan payload terstruktur tanpa *duplicate alert storm*.
- [ ] Lolos pengujian `osc_docs/test_flows/MN04-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-MN04-BE.md`