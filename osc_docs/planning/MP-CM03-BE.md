---
code: MP-CM03-BE
module: CM03 (Audit Trail & Log Rotation)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Centralized Audit Trail Interceptor & Background Log Partition Rotator

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/audit/interceptor.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan audit interceptor untuk merekam setiap mutasi data CUD ke `trx_audit_trail` (JSONB `old_values` & `new_values`).
2. Buat background worker yang mengevaluasi kebijakan `dat_log_rotation_policy`.
3. Otomatisasi pengarsipan partisi bulanan (`log_*` & `trx_audit_trail`) berusia > 90 hari ke RustFS atau eksekusi `DROP PARTITION`.

## Acceptance Criteria
- [ ] Mutasi data tercatat secara *asynchronous* tanpa menghambat latensi API main thread.
- [ ] Worker rotasi log mengeksekusi aksi penanganan partisi dan mencatat laporan ke `trx_job_execution`.
- [ ] Lolos pengujian `osc_docs/test_flows/CM03-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-CM03-BE.md`