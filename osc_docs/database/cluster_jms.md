# Osc_base — `prisma/schema/cluster_jms.prisma`

> Dokumen detail cluster **JMS** — Job Management (`jms_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster JMS menyimpan definisi job, jadwal (cron), dan riwayat eksekusi. Tabel
**run termasuk log** dan dipurge retention (`RE_DAYS_JMS_RUN`, default 90 hari).

## 2. Model

### 2.1 `jms_job`
- `@@unique([company_id, code])`; `job_type` ∈ `SHELL | HTTP | SQL`;
  `command`/`endpoint`, `enabled`.

### 2.2 `jms_schedule`
- `onDelete: Cascade` dari `jms_job`; `cron`, `timezone`, `is_active`,
  `last_run_at`, `next_run_at`.

### 2.3 `jms_run`
- `onDelete: Cascade` dari `jms_job`; `status` ∈ `RUNNING | SUCCESS | FAILED`;
  `exit_code`, `output`, `error`, `duration_ms`, `started_at`, `finished_at`.
- Indeks `job_id`, `started_at`, `status`.

## 3. Relasi Inti

```text
jms_job (1) ──► (N) jms_schedule
        └──► (N) jms_run
```

## 4. Catatan

- `jms_run` masuk daftar retensi `osc_rest/backbone/retention.go`.
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
