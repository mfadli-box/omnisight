---
code: MP-CM02-BE
module: CM02 (Tenant & Master Data)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Axum Middleware for Multi-Company Tenant Isolation & Permission Validation

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/middleware/rbac.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat middleware `osc_rest/src/middleware/rbac.rs` untuk mengintersepsi seluruh HTTP request.
2. Ekstrak JWT Claims (`user_id`, `company_id`, `role_id`, `permissions`).
3. Validasi keanggotaan user di `trx_user_company` dan `trx_user_area` untuk mencegah *Cross-Tenant Data Leak*.
4. Periksa matrik izin granular (`can_create`, `can_read`, `can_update`, `can_delete`, `can_execute`) per sub-modul target.

## Acceptance Criteria
- [ ] Menolak request lintas tenant tanpa otorisasi dengan HTTP 403 Forbidden.
- [ ] Meng-inject `TenantContext` yang terverifikasi ke dalam Axum Request Extension.
- [ ] Lolos pengujian `osc_docs/test_flows/CM02-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-CM02-BE.md`