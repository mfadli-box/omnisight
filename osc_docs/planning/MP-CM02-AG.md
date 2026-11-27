---
code: MP-CM02-AG
module: CM02 (Tenant & Master Data)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: low
token_optimization: true
---
# Task: Dynamic Tenant Tagging & Area Context Poller Worker

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/config/tenant_poller.go && echo "TENANT_POLLER_EXISTS" || echo "TENANT_POLLER_MISSING"
```

## Objective & Scope
1. Sync konfigurasi tenant (`company_id`, `area_id`, `store_id`) dari `osc_rest` secara periodik (setiap 5 menit).
2. Sisipkan tag `company_code` dan `area_code` pada setiap payload telemetri yang dikirimkan agen.

## Acceptance Criteria
- [ ] Tagging tenant diperbarui secara otomatis tanpa *restart* service agen.
- [ ] Payload telemetri memuat meta data multi-tenant yang sah.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-CM02-AG.md`