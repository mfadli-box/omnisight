---
code: MP-MN01-AG
module: MN01 (Lightweight Agent Metrics)
owner: ai-auto
target_model: gpt-6-sol
reasoning_effort: high
token_optimization: true
---
# Task: High-Performance Telemetry Collector with HMAC SHA-256 Egress in Golang

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_auto/internal/metrics/collector.go && echo "METRICS_OK" || echo "METRICS_MISSING"
```

## Objective & Scope
1. Gunakan `shirou/gopsutil/v3` untuk mengambil metrik CPU, RAM, Disk I/O, Network Throughput, dan Top 5 Process consuming CPU/Memory.
2. Hitung HMAC SHA-256 signature dari payload JSON menggunakan `hmac_secret`.
3. Kirim POST request ke `osc_rest` dengan header `X-Agent-Signature` setiap 10 detik.

## Acceptance Criteria
- [ ] Berjalan stabil di OS Ubuntu 24.04 & Windows 11 dengan alokasi CPU < 1%.
- [ ] Signature HMAC valid dan diterima oleh middleware backend `osc_rest`.

## Output Deliverables
- Catatan kerja: `osc_auto/notes/MP-MN01-AG.md`