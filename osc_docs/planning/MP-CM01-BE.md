---
code: MP-CM01-BE
module: CM01 (Identity & HRIS Auth Sync)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Build HRIS Web Service Client & Fallback Recovery Mechanism in Rust

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/auth/hris_client.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan `hris_client.rs` di `osc_rest` menggunakan `reqwest` (HTTP timeout 3 detik).
2. Parse XML response menggunakan `quick-xml` dengan fitur DTD expansion dinonaktifkan (mencegah celah XXE).
3. Jika status HRIS == 1, perbarui hash `hris_backup_password` di tabel `dat_user`.
4. Jika HRIS timeout/error, alihkan autentikasi ke Fallback Recovery Mode berbasis `hris_backup_password` lokal.

## Acceptance Criteria
- [ ] Berhasil memproses XML status 1 dan mengembalikan JWT Claims.
- [ ] Mengaktifkan Fallback Recovery otomatis saat endpoint HRIS tidak merespon.
- [ ] Lolos pengujian `python3 osc_docs/test_flows/CM01-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-CM01-BE.md`