# Osc_base — `prisma/schema/cluster_bot.prisma`

> Dokumen detail cluster **BOT** — Bot/Agent (`bot_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster BOT menyimpan registrasi agent, heartbeat (telemetry), dan antrean
tugas. Endpoint agent memakai grup `/rest/agent` (`USBots()`).

## 2. Model

### 2.1 `bot_agent`
- `@@unique([company_id, code])`; `token` unik (default `uuid`) untuk
  autentikasi agent.
- `status` ∈ `ONLINE | OFFLINE | DISABLED`; `last_seen`, `is_active`.

### 2.2 `bot_heartbeat`
- `onDelete: Cascade` dari `bot_agent`; `cpu_pct`, `mem_pct`, `disk_pct`,
  `load_avg`, `uptime_s`.
- **Telemetry** — dipurge retention (`RE_DAYS_BOT_HEARTBEAT`, default 30 hari).

### 2.3 `bot_task`
- `onDelete: Cascade` dari `bot_agent`; `payload` (JSON), `status`
  ∈ `QUEUED | RUNNING | DONE | FAILED`, `priority`, `scheduled_at`,
  `started_at`, `finished_at`, `result`, `error`.

## 3. Relasi Inti

```text
bot_agent (1) ──► (N) bot_heartbeat
          └──► (N) bot_task
```

## 4. Catatan

- `bot_heartbeat` masuk daftar retensi `osc_rest/backbone/retention.go`.
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
