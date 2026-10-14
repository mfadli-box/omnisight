# Osc_base — `prisma/schema/cluster_obs.prisma`

> Dokumen detail cluster **OBS** — Observability (`obs_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster OBS menyimpan metrik, log, dan alert. Tabel **metrik & log termasuk
telemetry/log** dan dipurge retention (`RE_DAYS_OBS_METRIC`, `RE_DAYS_OBS_LOG`).

## 2. Model

### 2.1 `obs_metric`
- `source`, `name`, `value`, `unit`, `labels` (JSON), `recorded_at`.
- Indeks `company_id`, `[source, name, recorded_at]`, `recorded_at`.

### 2.2 `obs_log`
- `source`, `level` ∈ `DEBUG | INFO | WARN | ERROR | FATAL`, `message`,
  `context` (JSON), `recorded_at`.
- Indeks `company_id`, `level`, `source`, `recorded_at`.

### 2.3 `obs_alert`
- `@@unique([company_id, code])`; `severity`, `source`, `condition`, `message`.
- `status` ∈ `FIRING | ACK | RESOLVED`; `triggered_at`, `acked_at`, `resolved_at`.

## 3. Catatan

- Modul `OBS` juga diproyeksikan menjadi **platform monitoring ala Beszel**
  (hub + agent). Model tambahannya (`obs_system`, `obs_metric_rollup`,
  `obs_disk`, `obs_container_stat`, **`obs_vmhost`, `obs_vm`, `obs_vm_stat`**
  (VM host & guest hypervisor; prioritas Incus/LXD), `obs_check`, `obs_check_group`
  (grup + dependensi induk→anak), `obs_check_result`, `obs_alert_rule`,
  `obs_notification`, `obs_silence`, **`obs_dashboard`, `obs_report`,
  `obs_maintenance`, `obs_status_page`, `obs_status_page_item`,
  `obs_status_page_incident`, `obs_service`, `obs_import_job`**)
  masih **rencana** — lihat [../planning/app_obs.md](../planning/app_obs.md).
  Dokumen ini akan diperbarui saat tabel tersebut dibangun.
- `obs_vmhost`/`obs_vm` bertaut ke modul **VMS** (`vms_host`/`vms_guest`);
  `obs_vm_stat` time-series beretensi.
- Perluasan model **rencana** (kekurangan audit Beszel/Uptime Kuma):
  - `obs_service` — unit **systemd** per sistem (status, `restart_count`,
    CPU/mem); log journal disimpan di `obs_log` (`source=systemd`), pemakaian ke
    `obs_metric` (`subkey=<unit>`).
  - `obs_disk` — tambah `fstype`/`pool`/**Btrfs** (`scrub_state`), **eMMC**
    (`emmc_life_time`, `emmc_pre_eol`), **mdraid** (`mdraid_state`, `mdraid_level`).
  - `obs_container_stat` — tambah `health` & `restart_count`.
  - `obs_check` — tipe diperluas (**WS**, **MYSQL/MARIADB/POSTGRES/MONGODB/REDIS**,
    **SMTP**/**RADIUS**), kolom `driver`, `dns_record_type`, `http_options` (JSON),
    dan `proxy` (JSON) per monitor.
  - `obs_notification` — `type` diperluas (Gotify/Pushover/Teams/Matrix/Mattermost/
    Pushbullet/Signal/Twilio/…), `config` terenkripsi.
  - `obs_status_page` — tambah `custom_domain`, `badge_enabled`/`badge_label`;
    insiden/pengumuman di `obs_status_page_incident`.
  - `obs_import_job` — migrasi opsional dari **Uptime Kuma**.
- `obs_metric` (default 30 hari) & `obs_log` (default 90 hari) masuk daftar
  retensi `osc_rest/backbone/retention.go`; `obs_disk`/`obs_service` = snapshot
  terbaru (upsert), `obs_import_job` retensi singkat.
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
