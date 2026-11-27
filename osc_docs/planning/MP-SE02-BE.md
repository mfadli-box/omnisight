---
code: MP-SE02-BE
module: SE02 (SIEM & Threat Guard)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: SIEM Event Log Collector & Real-Time WAF Attack Interceptor

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/siem/waf_interceptor.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat middleware WAF untuk mendeteksi payload SQL Injection, Cross-Site Scripting (XSS), dan XXE pada HTTP Request Body/Query.
2. Terapkan pemblokiran otomatis (HTTP 403) serta pencatatan insiden ancaman ke `log_security_guard`.
3. Sediakan API integrasi ingest log Wazuh/Syslog ke tabel `log_siem_event`.

## Acceptance Criteria
- [ ] Memblokir serangan SQLi (`' OR 1=1`) dan XXE payload secara instan.
- [ ] Mencatat alamat IP penyerang, tipe ancaman, dan pola payload ke database audit.
- [ ] Lolos pengujian `osc_docs/test_guard/SE02-G.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-SE02-BE.md`