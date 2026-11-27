---
code: MP-NP01-BE
module: NP01 (Nginx Proxy Manager)
owner: ai-rest
target_model: gpt-6.1-sol
reasoning_effort: medium
token_optimization: true
---
# Task: Automated Nginx VHost Config Generator & ACME Let's Encrypt Client

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/network/nginx_manager.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Buat service pembuat berkas konfigurasi Nginx Virtual Host dari record `dat_nginx_vhost`.
2. Jalankan pengujian validasi sintaks `nginx -t` via process execution dan eksekusi `nginx -s reload`.
3. Integrasikan client ACME Let's Encrypt untuk pembuatan dan auto-renew sertifikat SSL.

## Acceptance Criteria
- [ ] Konfigurasi Nginx tergenerasi dengan header keamanan lengkap (HSTS, TLS 1.3).
- [ ] Mencegah reload Nginx jika sintaks konfigurasi gagal dites (`nginx -t` error).
- [ ] Lolos pengujian `osc_docs/test_flows/NP01-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-NP01-BE.md`