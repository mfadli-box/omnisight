---
code: MP-CM02-FE
module: CM02 (Tenant & Master Data)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Tenant Searchable Combobox & Interactive RBAC Permission Grid

## Fast Pre-Check
```bash
test -s osc_site/src/components/cm/SearchableCombobox.tsx && echo "COMBOBOX_EXISTS" || echo "COMBOBOX_MISSING"
```
- Jika `COMBOBOX_EXISTS`: Respon `"Tugas CM02-FE (Combobox & RBAC Matrix) sudah selesai."` dan STOP.

## Objective & Scope
1. Buat komponen `SearchableCombobox.tsx` yang menampilkan Nama Perusahaan/Area dan menyembunyikan UUID mentah dari tampilan pengguna.
2. Buat komponen editor matriks izin `PermissionMatrixGrid.tsx` untuk konfigurasi hak akses `can_create`, `can_read`, `can_update`, `can_delete`, `can_execute` per modul.

## Acceptance Criteria
- [ ] Combobox mendukung pencarian fuzzy nama company/area.
- [ ] Matrix Editor memungkinkan toggle switch hak akses secara real-time.

## Output Deliverables
- `osc_site/src/components/cm/SearchableCombobox.tsx` & `PermissionMatrixGrid.tsx`
- Catatan kerja: `osc_site/notes/MP-CM02-FE.md`