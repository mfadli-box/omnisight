# Osc_base — `prisma/schema/cluster_pod.prisma`

> Dokumen detail cluster **POD** — Container/Pod (`pod_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster POD menyimpan cluster orkestrasi container, node, dan workload.

## 2. Model

### 2.1 `pod_cluster`
- `@@unique([company_id, code])`; `provider` ∈ `K8S | OPENSHIFT | NOMAD | DOCKER`.
- `api_endpoint`, `version`, `status`.

### 2.2 `pod_node`
- `@@unique([cluster_id, name])`; `onDelete: Cascade` dari `pod_cluster`.
- `role` ∈ `WORKER | CONTROL`; `cpu_capacity`, `mem_capacity_mb`, `last_seen`.

### 2.3 `pod_workload`
- `@@unique([cluster_id, namespace, name, kind])`.
- `kind` ∈ `DEPLOYMENT | STATEFULSET | DAEMONSET | POD | JOB`; `image`,
  `replicas`, `ready_replicas`, `status`.

## 3. Relasi Inti

```text
pod_cluster (1) ──► (N) pod_node
             └──► (N) pod_workload
```

## 4. Catatan

- Modul `POD` juga mencakup **runtime Docker/Podman** (pengganti Dockge &
  Arcane). Model tambahannya (`pod_engine`, `pod_stack`, `pod_stack_revision`,
  `pod_service`, `pod_container`, `pod_image`, `pod_volume`, `pod_network`,
  `pod_registry`, `pod_action`, `pod_env_var`, `pod_git_credential`,
  `pod_git_sync`, `pod_build`, `pod_backup`, `pod_scan`, `pod_scan_finding`,
  `pod_template`, `pod_template_registry`, `pod_exec_session`, `pod_pod`,
  `pod_secret`, `pod_disk_usage`, `pod_webhook`) masih **rencana** — lihat
  [../planning/app_pod.md](../planning/app_pod.md). Dokumen ini akan diperbarui
  saat tabel tersebut dibangun.
- Konvensi umum model: [README.md](README.md#4-konvensi-model).

## 5. Model Runtime Lanjutan (rencana gap)

Menindaklanjuti audit paritas Dockge/Arcane, ditambahkan perluasan model dan
model baru berikut (semua **rencana**, detail di
[../planning/app_pod.md](../planning/app_pod.md) §6.2–§6.3):

- **Perluasan field** — `pod_container`/`pod_image` (`update_strategy`,
  `version_constraint`, `tag_pattern`, `latest_version`, `auto_heal`,
  `patch_available`, `patched_tag`); `pod_backup` (`kind`, `s3_config`,
  `selective`, `schedule_id`, `safety_backup_id`); `pod_scan`/`pod_scan_finding`
  (`risk_score`, `kev_count`, `epss_max`, `in_kev`, `epss`, `trend`,
  `trivy_server`); `pod_git_credential`/`pod_git_sync` (`gpg_key_enc`,
  `commit_name`, `commit_email`, `host_key_mode`, `pre_deploy`, `env_git_policy`,
  `gpg_sign`).
- **Model baru** — `pod_update_check`, `pod_heal_policy`, `pod_backup_schedule`,
  `pod_system_backup`, `pod_patch`, `pod_scan_schedule`, `pod_threat_intel`,
  `pod_registry_repository`, `pod_registry_tag`, `pod_port_binding`, `pod_gpu`,
  `pod_notification_channel`, `pod_notification_template`, `pod_log_setting`,
  `pod_api_key`.

```text
pod_engine (1) ──► (N) pod_update_check · pod_heal_policy · pod_gpu
pod_engine (1) ──► (N) pod_port_binding (published ports)
pod_image (1) ──► (N) pod_patch (→ pod_scan)
pod_scan (1) ──► (N) pod_scan_finding; pod_scan_schedule (1) ──► (N) pod_scan
pod_backup_schedule (1) ──► (N) pod_backup; pod_system_backup (full system)
pod_registry (1) ──► (N) pod_registry_repository ──► pod_registry_tag
pod_notification_channel (1) ──► (0..1) pod_notification_template
pod_threat_intel (cache KEV/EPSS, company-scope)
pod_api_key (company) · pod_log_setting (engine)
```
