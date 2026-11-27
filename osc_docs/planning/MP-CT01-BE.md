---
code: MP-CT01-BE
module: CT01 (Docker Stack Engine)
owner: ai-rest
target_model: gpt-6.1-terra
reasoning_effort: high
token_optimization: true
---
# Task: Asynchronous Docker Engine Client Wrapper via Bollard Crate

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/container/docker_engine.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Hubungkan `osc_rest` ke UNIX socket `/var/run/docker.sock` menggunakan crate `bollard`.
2. Sediakan endpoint API manajemen container stack (`start`, `stop`, `restart`, `deploy`).
3. Sanitasi masukan nama container dan variabel lingkungan terenkripsi AES-256 (`env_vars_encrypted`).

## Acceptance Criteria
- [ ] REST API merespon status runtime container dan penggunaan resource CPU/RAM.
- [ ] Terproteksi dari celah *Command Injection* pada parameter Compose YAML.
- [ ] Lolos pengujian `osc_docs/test_guard/CT01-G.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-CT01-BE.md`