---
code: MP-SE01-BE
module: SE01 (PAM & Bastion Terminal)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Privileged Access Vault & Web-based SSH/RDP Bastion Proxy in Rust

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/pam/bastion_handler.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan vault kredensial terenkripsi AES-256-GCM (`dat_pam_credential`) untuk kunci SSH dan password server.
2. Sediakan proxy terminal SSH via WebSocket (`/ws/v1/pam/ssh`) tanpa mengekspos kunci privat mentah ke client browser.
3. Rekam seluruh rekaman teks sesi terminal ke RustFS (`session_recording_path`) dan catat audit di `log_pam_session`.

## Acceptance Criteria
- [ ] Kredensial privat terenkripsi aman dan tidak pernah bocor di log atau HTTP response payload.
- [ ] Sesi TTY SSH terintersepsi dan tercatat penuh untuk kebutuhan audit forensik.
- [ ] Lolos pengujian `osc_docs/test_guard/SE01-G.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-SE01-BE.md`