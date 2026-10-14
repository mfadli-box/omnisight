# Osc_base — `prisma/schema/cluster_dso.prisma`

> Dokumen detail cluster **DSO** — DevOps/CI-CD (`dso_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster DSO menyimpan pipeline, build, dan deployment.

## 2. Model

### 2.1 `dso_pipeline`
- `@@unique([company_id, code])`; `provider` ∈ `GITHUB | GITLAB | JENKINS | OTHER`;
  `repo_url`, `branch`, `is_active`.

### 2.2 `dso_build`
- `@@unique([pipeline_id, number])`; `onDelete: Cascade` dari `dso_pipeline`.
- `status` ∈ `QUEUED | RUNNING | SUCCESS | FAILED | CANCELED`;
  `commit_sha`, `duration_ms`, `artifact_url`, `logs_url`.

### 2.3 `dso_deploy`
- `onDelete: Cascade` dari `dso_build`; `environment`, `version`, `released_by`.
- `status` ∈ `PENDING | RUNNING | SUCCESS | FAILED | ROLLED_BACK`.

## 3. Relasi Inti

```text
dso_pipeline (1) ──► (N) dso_build (1) ──► (N) dso_deploy
```

## 4. Catatan

- Konvensi umum model: [README.md](README.md#4-konvensi-model).
