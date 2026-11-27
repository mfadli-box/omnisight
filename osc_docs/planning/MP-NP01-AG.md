---
code: MP-NP01-AG
module: NP01 (Nginx Proxy Manager)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Nginx VHost File Sync Agent & Validation Reload Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/nginx/sync.go && echo "NGINX_SYNC_OK" || echo "NGINX_SYNC_MISSING"
```

## Objective & Scope
1. Terima berkas konfigurasi Nginx `.conf` dari backend `osc_rest`.
2. Eksekusi `nginx -t` via command execution aman untuk validasi sintaks.
3. Jika valid, perbarui `/etc/nginx/sites-available/` dan jalankan `nginx -s reload`.

## Acceptance Criteria
- [ ] Jika sintaks `nginx -t` error, agen membatalkan pergantian file dan melaporkan *stderr* ke backend.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-NP01-AG.md`