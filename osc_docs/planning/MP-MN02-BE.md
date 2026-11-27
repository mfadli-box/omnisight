---
code: MP-MN02-BE
module: MN02 (Synthetic Uptime & SSL)
owner: ai-rest
target_model: gpt-6.1-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Asynchronous Endpoint Uptime Poller & TLS Certificate Expiry Service

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/telemetry/uptime_poller.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat scheduler pengecekan target HTTP/HTTPS, TCP Port, dan ICMP Ping.
2. Inspeksi masa berlaku sertifikat SSL/TLS dan hitung sisa hari berlaku (`ssl_warn_days`, `ssl_crit_days`).
3. Agregasikan metrik harian SLA ketersediaan ke `trx_uptime_summary_daily`.

## Acceptance Criteria
- [ ] Mendeteksi kejatuhan endpoint (downtime) dan memicu pembaruan status `trx_uptime_status`.
- [ ] Mengirimkan sinyal peringatan saat sertifikat SSL berada di bawah ambang batas kedaluwarsa.
- [ ] Lolos pengujian `osc_docs/test_flows/MN02-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-MN02-BE.md`