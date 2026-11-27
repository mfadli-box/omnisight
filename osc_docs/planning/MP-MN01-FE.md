---
code: MP-MN01-FE
module: MN01 (Lightweight Agent Metrics)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Agent Telemetry Dashboard, Real-time CPU/RAM Gauge & Load Charts

## Fast Pre-Check
```bash
test -s osc_site/src/app/(dashboard)/mn/agent-metrics/page.tsx && echo "MN01_EXISTS" || echo "MN01_MISSING"
```

## Objective & Scope
1. Buat dashboard telemetri server (`/mn/agent-metrics/page.tsx`).
2. Tampilkan grafik real-time CPU, RAM, Disk I/O, dan Network Throughput menggunakan Recharts / Chart.js.
3. Tampilkan tabel status agen `osc_auto` (`ONLINE`, `OFFLINE`, `DEGRADED`).

## Output Deliverables
- `osc_site/src/app/(dashboard)/mn/agent-metrics/page.tsx`
- Catatan kerja: `osc_site/notes/MP-MN01-FE.md`