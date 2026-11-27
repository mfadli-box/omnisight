---
code: MP-CT01-AG
module: CT01 (Docker Stack Engine)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: Local Docker Unix Socket Telemetry & Event Streamer in Golang

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/docker/monitor.go && echo "DOCKER_MONITOR_EXISTS" || echo "DOCKER_MONITOR_MISSING"
```

## Objective & Scope
1. Hubungkan `osc_auto` ke `/var/run/docker.sock` atau Named Pipe Windows (`\\.\pipe\docker_engine`).
2. Kumpulkan metrik penggunaan CPU/Memory container dan dengarkan event `die`, `oom`, `restart`.
3. Kirimkan event insiden container secara real-time ke `osc_rest`.

## Acceptance Criteria
- [ ] Event `OOMKilled` atau container crash terkirim < 1 detik ke backend.
- [ ] Penggunaan memori poller Docker di bawah 15MB RAM.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-CT01-AG.md`