---
code: MP-CT02-BE
module: CT02 (Container Terminal & Logs)
owner: ai-rest
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Interactive WebSocket TTY Exec, Log Tailing & Docker Image Pruning Handler

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_rest/src/domain/container/terminal_handler.rs && cargo check --manifest-path osc_rest/Cargo.toml > /dev/null 2>&1 && echo "DONE" || echo "PENDING"
```

## Objective & Scope
1. Implementasikan WebSocket handler (`/ws/v1/containers/:id/exec`) untuk interaktif `docker exec -it` dua arah.
2. Buat log streamer WebSocket (`/ws/v1/containers/:id/logs`) dengan opsi tail line limit.
3. Buat service inventarisasi Docker Image dan pembersihan disk (`docker image prune -a`) yang merekam *reclaimed_bytes* ke `trx_docker_prune_job`.
4. Audit seluruh perintah TTY ke `log_container_exec_audit` dan beri penanda `is_flagged_danger = TRUE` jika terdeteksi perintah berbahaya (`rm -rf`, `mkfs`).

## Acceptance Criteria
- [ ] WebSocket TTY mendukung sinkronisasi ukuran terminal (`tty_cols`, `tty_rows`).
- [ ] Pembersihan image berstatus *dangling* berhasil membebaskan kapasitas disk.
- [ ] Lolos pengujian `osc_docs/test_flows/CT02-F.py`.

## Output Deliverables
- Catatan kerja: `osc_rest/notes/MP-CT02-BE.md`