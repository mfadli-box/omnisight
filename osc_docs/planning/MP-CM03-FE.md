---
code: MP-CM03-FE
module: CM03 (Audit Trail & Settings)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Audit Trail Explorer Table, Date/User Filter & Export Button

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/cm/audit-trail/page.tsx && echo "AUDIT_PAGE_EXISTS" || echo "AUDIT_PAGE_MISSING"
```

## Objective & Scope
1. Buat halaman Audit Trail (`osc_site/src/app/(dashboard)/cm/audit-trail/page.tsx`).
2. Sediakan filter rentang tanggal, pencarian user, modul, dan tipe aksi (CUD).
3. Tampilkan diff perubahan data `old_values` vs `new_values` dalam modal inspeksi JSON.

## Output Deliverables
- `osc_site/src/app/(dashboard)/cm/audit-trail/page.tsx`
- Catatan kerja: `osc_site/notes/MP-CM03-FE.md`