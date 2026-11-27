---
code: MP-SE01-AG
module: SE01 (Privileged Access Management - PAM)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: Local SSH/RDP Tunnel Proxy Agent with Ephemeral Key Verification

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/pam/tunnel.go && echo "PAM_TUNNEL_OK" || echo "PAM_TUNNEL_MISSING"
```

## Objective & Scope
1. Buka encrypted reverse tunnel ke `osc_rest` PAM Gateway saat ada sesi JumpServer aktif.
2. Gunakan kunci SSH sementara (ephemeral SSH keys) yang hangus otomatis dalam 30 menit.

## Acceptance Criteria
- [ ] Tunnel terenkripsi dengan TLS 1.3 & SSH Ed25519.
- [ ] Kredensial privat tidak pernah tersimpan di sistem berkas disk host secara permanen.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-SE01-AG.md`