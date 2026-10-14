# Planning `OBS` — Observability & Server/Container Monitoring (pengganti Beszel)

> Rencana modul **`OBS`** sebagai platform monitoring ringan ala
> [Beszel](https://beszel.dev): **hub + agent**, metrik host & container
> (Docker/Podman), data historis, alert, dan notifikasi. Bagian dari
> [Planning](README.md) · Lihat juga [blueprint](blueprint.md),
> [roadmap](roadmap.md), [checklist](checklist.md), serta modul terkait
> [POD](app_pod.md) (runtime container) dan `BOT` (agent/heartbeat).

## 1. Tujuan & Lingkup

Menggantikan Beszel dengan platform monitoring bawaan OmniSight:

- **Hub** — API + UI di `osc_rest`/`osc_site`, menyimpan data historis dan
  mengevaluasi alert.
- **Agent** — biner Go per-VM (`osc_auto/agent_vm`) di tiap host, mengumpulkan metrik sistem &
  container lalu mengirim ke hub.
- **Metrik** — CPU, memori (swap/ZFS ARC), disk (kapasitas/I-O/SMART/ZFS),
  jaringan, load average, temperatur, fan, GPU (NVIDIA/AMD/Intel), baterai.
- **Container stats** — status + riwayat CPU/memori/jaringan per container
  Docker/Podman.
- **VM host & guest** — agen mendeteksi **hypervisor** dan mengumpulkan metrik
  **host** + **daftar & metrik VM guest** (CPU/mem/disk/net) yang berjalan di
  atasnya. Prioritas Fase A: **Incus/LXD** (`incus`/`lxc`); hypervisor lain
  (libvirt/KVM, Proxmox VE, VMware, XCP-ng) menyusul. Bila agen berada di dalam
  VM, ia melaporkan identitas guest + host-nya.
- **Network monitor** — probe ICMP/TCP/HTTP/DNS dari agent (response time,
  packet loss) + **health perangkat/interface** dari `NET` (SNMP).
- **Alert** — aturan + notifikasi dengan **banyak kanal**: email/SMTP, webhook,
  ntfy, Telegram, Slack, Discord, **Gotify, Pushover, Microsoft Teams, Matrix,
  Mattermost, Pushbullet, Signal, Twilio**, dan lain-lain; **scope luas**:
  SYSTEM, CONTAINER (**down/restart-loop**), DEVICE/**INTERFACE** (`NET`),
  **SERVICE** (systemd), **DISK** (Btrfs/eMMC/mdraid), CHECK.
- **Dashboard kustom** — widget/tile yang bisa ditata per user/company.
- **Laporan** — ekspor/ringkasan (PDF/Excel) terjadwal via `JMS`.
- **Status page** — halaman publik/mandiri (ala uptime-kuma) berisi monitor
  terpilih + uptime, dengan mode publik tanpa login, **insiden/pengumuman**
  (`obs_status_page_incident`), **custom domain**, dan **badge publik** (SVG).
- **Maintenance window** — jendela peredam terjadwal (silence) agar alert tidak
  berisik saat pemeliharaan.
- **Expiry monitoring** — pantau **kedaluwarsa sertifikat TLS** & **domain
  (WHOIS)** sebagai tipe check, dengan notifikasi dini (integrasi [WEB](app_web.md)).
- **Tipe monitor lanjutan** — selain ICMP/TCP/HTTP/DNS: **keyword/JSON assertion**,
  **PUSH/heartbeat** (monitor pasif), **gRPC**, **MQTT**,
  **database per-engine** (MySQL/MariaDB/PostgreSQL/MongoDB/Redis), dan
  **browser/real-check** opsional.
- **Grup & dependensi monitor** — kelompokkan monitor (`obs_check_group`), relasi
  **induk→anak** (bila induk DOWN, alert anak **di-suppress**), dan **tag**.
- **Monitoring service systemd** — status, CPU/memori, jumlah restart, dan
  **log journal** per unit (`obs_service`; kolektor D-Bus/`systemd` + `journald`).
- **Filesystem & storage lanjutan** — **Btrfs** (pool/subvolume, `scrub`,
  penggunaan) di samping ZFS; **eMMC wear/EOL** dan **array `mdraid`**
  (`/proc/mdstat`) melengkapi health disk.
- **Opsi HTTP kaya** — metode, header, body, basic/bearer auth, rentang status
  diterima, max redirect, toggle verifikasi TLS, cache-buster (`http_options`
  JSON pada `obs_check`).
- **Check WebSocket (`WS`)** — handshake + kirim/terima pesan keepalive opsional.
- **Check database per-engine** — MySQL/MariaDB, PostgreSQL, MongoDB, Redis
  (parametrik `driver`, bukan `DATABASE` generik).
- **Check SMTP/Radius & DNS per record-type** — SMTP (banner/queue) dan Radius
  (auth); DNS dengan **record type + nilai diharapkan**
  (A/AAAA/CNAME/MX/TXT/NS/SRV/…).
- **Proxy per-monitor** — probe dapat keluar lewat proxy (HTTP/SOCKS) per check.
- **Mode real-time (~1s)** — stream metrik live opsional di samping interval normal.
- **Granularitas container** — **restart count** & status **health** per container.
- **Keamanan login hub** — **2FA/TOTP** mewarisi auth platform OmniSight
  (`USAuth`), bukan sistem terpisah.
- **Migrasi/import** — importir opsional dari **Uptime Kuma** (monitor, kanal
  notifikasi, status page).
- **Ekspor Prometheus** — endpoint `/metrics` untuk di-scrape eksternal.
- **Multi-tenant** — sistem per `company_id`, berbagi sistem antar user,
  RBAC OmniSight.

> Catatan lingkup: Beszel **tidak mengelola siklus hidup container** (start/
> stop/deploy). Aspek itu adalah ranah modul [POD](app_pod.md). `OBS` berfokus
> **memantau**; integrasi POD dipakai untuk sumber data container.

## 2. Paritas Fitur dengan Beszel

| Fitur Beszel | Target `OBS` | Catatan |
|---|---|---|
| Agent ringan (Go) | ✅ | agen `osc_auto/agent_vm` (capability `metrics`), reuse infra `BOT` (`/rest/agent`). |
| Metrik CPU/memori/disk/net/load/temp/fan/baterai | ✅ | `gopsutil` (Go). |
| Container stats (CPU/mem/net per container) | ✅ | Baca Engine API (reuse `mechanic/dockerclient` dari `POD`). |
| Container restart/health granularity | ✅ | `obs_container_stat.restart_count`/`health`. |
| **systemd service** | — | Ditambah OmniSight: `obs_service` (status/CPU/mem/restart/journal). |
| VM host & guest (hypervisor) | — | Ditambah OmniSight: capability agen **`vmhost`** (**Incus/LXD** dulu). |
| Data historis | ✅ | `obs_metric` + rollup harian; retensi terkonfigurasi. |
| Mode real-time (~1s) | — | Ditambah OmniSight: stream WS opsional (`useSocket`). |
| Alert semua metrik | ✅ | `obs_alert_rule` → `obs_alert` (FIRING/ACK/RESOLVED). |
| Banyak layanan notifikasi | ✅ | `obs_notification` (email/webhook/ntfy/Telegram/Slack/Discord/**Gotify/Pushover/Teams/Matrix/Mattermost/Pushbullet/Signal/Twilio/…**). |
| Multi-user & share sistem | ✅ | `company_id` + privilege OmniSight. |
| OAuth/OIDC | ⚠️ | Opsional; Prioritas auth OmniSight dulu. |
| 2FA/TOTP login | ✅ | Mewarisi auth OmniSight (`USAuth`), bukan sistem terpisah. |
| Network monitoring (ICMP/TCP/HTTP/DNS) | ✅ | `obs_check` + `obs_check_result`. |
| Keyword/JSON assertion monitor | ✅ | `obs_check` type KEYWORD/JSON (grep/JSONPath). |
| PUSH/heartbeat (monitor pasif) | ✅ | `obs_check` type PUSH (token per check). |
| Tipe tambahan (gRPC/MQTT/DB) | ✅ | `obs_check` type **GRPC/MQTT** + DB per-engine (**MYSQL/MARIADB/POSTGRES/MONGODB/REDIS**). |
| Check WebSocket (`WS`) | ✅ | `obs_check` type **WS** (handshake + pesan opsional). |
| SMTP / Radius & DNS record-type | ✅ | `obs_check` type **SMTP/RADIUS**; DNS `record_type` + `expected`. |
| Opsi HTTP lanjutan | ✅ | `obs_check.http_options` (method/header/body/auth/status-range/redirect/TLS). |
| Proxy per-monitor | ✅ | `obs_check.proxy` (HTTP/SOCKS) per probe. |
| Grup & dependensi monitor | ✅ | `obs_check_group` + `parent_id` (suppress anak saat induk DOWN). |
| Tag monitor | ✅ | `obs_check.tags` (Json) + filter. |
| Retry & upside-down | ✅ | `obs_check.retries`, `upside_down` (status terbalik). |
| Ekspor Prometheus | ✅ | `GET /rest/metrics` (format Prometheus). |
| **Status page publik** | ✅ | `obs_status_page` + `obs_status_page_item`; **insiden/pengumuman** (`obs_status_page_incident`), **custom domain**, **badge publik**. |
| **Maintenance window (silence)** | ✅ | `obs_maintenance` (jadwal + scope). |
| **Cert/domain expiry monitor** | ✅ | `obs_check` type CERT/DOMAIN (integrasi `WEB`). |
| Alert container down/restart-loop | — | Ditambah OmniSight: scope CONTAINER (`pod_container`). |
| Alert device/interface (`NET`) | — | Ditambah OmniSight: scope DEVICE/INTERFACE dari SNMP. |
| Alert service systemd (& disk) | — | Ditambah OmniSight: scope SERVICE (failed/restart) & DISK (Btrfs/eMMC/mdraid). |
| Dashboard kustom | — | Ditambah OmniSight: `obs_dashboard` (widget/tata letak). |
| Laporan/ekspor | ⚠️ | Ditambah OmniSight: `obs_report` (PDF/Excel via `JMS`). |
| S.M.A.R.T. | ✅ | `obs_disk.smart_*` (Linux `/sys`, `smartctl` opsional). |
| ZFS pool/dataset | ⚠️ | Opsional, via agent. |
| Btrfs pool/filesystem | ⚠️ | Opsional: `obs_disk.fstype=BTRFS` + `btrfs_*` (di samping ZFS). |
| eMMC wear/EOL & mdraid | ⚠️ | Opsional: `obs_disk` (wear/EOL) + array `/proc/mdstat`. |
| GPU NVIDIA/AMD/Intel | ⚠️ | Opsional, bertahap. |
| Backup otomatis (disk/S3) | ⚠️ | Manfaatkan backup DB `osc_base` (lihat `pgbouncer.sh`). |
| REST API | ✅ | Endpoint `/rest/pages/OBS/...`. |
| Import dari Uptime Kuma | — | Ditambah OmniSight: importir opsional (monitor/kanal/status page). |

## 3. Keputusan Arsitektur (draft — perlu konfirmasi §15)

1. **Kode modul:** `OBS` (**Beszel digabung ke OBS**) — halaman `OBS01`..`OBS0N`.
2. **Cluster DB:** `obs_*` (file `cluster_obs.prisma` + `cluster_obs.md`).
3. **Model agent:** **push via WebSocket** agent→hub (tanpa expose port publik,
   selaras `mechanic/sshproxy.go`). Mode SSH-pull (seperti Beszel) menyusul.
4. **Agen:** biner per-VM di **`osc_auto/`** (`osc_auto/agent_vm`, capability
   `metrics`), ditanam di setiap VM. Registrasi/heartbeat via `bot_agent` +
   `bot_heartbeat` (grup `/rest/agent`, `USBots()`); `obs_system.agent_id`
   merujuk `bot_agent`. **Agen tidak mengakses DB** — `osc_rest` penghubung
   tunggal.
5. **Penyimpanan time-series:** PostgreSQL (tabel `obs_metric` + rollup).
   Tanpa TSDB eksternal; rollup + retensi menjaga ukuran.
6. **Container stats:** reuse `pod_engine`/`dockerclient` (`POD`) bila engine
   sudah terdaftar; fallback: agent membaca socket lokal.
7. **VM host & guest:** capability agen **`vmhost`** mendeteksi hypervisor
   (`systemd-detect-virt`) lalu mengirim metrik host + daftar/metrik VM guest.
   **Prioritas: Incus/LXD** (`incus`/`lxc`); libvirt/KVM, Proxmox VE, VMware,
   XCP-ng menyusul. Terhubung ke modul `VMS` (`vms_host`/`vms_guest`). Agen tetap
   **tidak** mengakses DB.
8. **Monitoring service systemd:** kolektor via **D-Bus/`systemd`** + `journald`.
   Model `obs_service` (registry + status/restart); **log journal** masuk
   `obs_log` (`source=systemd`); pemakaian CPU/mem ke `obs_metric`
   (`subkey=<unit>`).
9. **Storage lanjutan:** **Btrfs** via CLI/ioctl (`btrfs filesystem`/`scrub`);
   **eMMC wear/EOL** dari sysfs (`life_time`, `pre_eol_info`); **mdraid** dari
   `/proc/mdstat`/`mdadm --detail` — semua melengkapi `obs_disk`.
10. **Notifikasi luas:** kanal diperluas pada `obs_notification` (Gotify,
    Pushover, Teams, Matrix, Mattermost, Pushbullet, Signal, Twilio, dll.);
    `config` **terenkripsi**; dapat didelegasikan/disinkron ke dispatcher
    [APP06 `app_sys.md`](app_sys.md).
11. **Opsi HTTP & proxy:** disimpan sebagai JSON pada `obs_check`
    (`http_options`, `proxy`) — method/header/body/auth/status-range/redirect/
    TLS/cache-buster dan proxy HTTP/SOCKS per monitor.
12. **Check DB per-engine:** `obs_check` memakai `driver` parametrik
    (MYSQL/MARIADB/POSTGRES/MONGODB/REDIS) menggantikan `DATABASE` generik.
13. **Mode real-time (~1s):** stream WS opsional (default tetap interval
    normal); hanya untuk sistem/monitor terpilih agar hemat.
14. **Status page lanjutan:** **insiden/pengumuman** (`obs_status_page_incident`),
    **custom domain**, dan **badge publik** (SVG).
15. **Migrasi:** importir opsional dari **Uptime Kuma** (monitor/kanal/status
    page) via `obs_import_job`.
16. **2FA/TOTP:** memakai auth platform OmniSight (`USAuth`/TOTP), **bukan**
    sistem terpisah di `OBS`.

## 4. Arsitektur & Topologi

```
agent_vm (osc_auto, tiap host) ──WS/HTTP──► osc_rest (/rest/agent/obs/*) ──► Postgres obs_*
        │  gopsutil + Engine API (docker/podman.sock)
        │  + systemd/journald (D-Bus) → status unit + log journal
        │  + vmhost (libvirt/Proxmox/Incus/VMware) → metrik host + VM guest
        └── push metrik, heartbeat, hasil probe

osc_site (hub UI: OBS01..) ──/proxy/pages/OBS/*──► osc_rest
                                     └── evaluasi alert ──► obs_notification ──► email/webhook/…
```

- **Hub:** `osc_rest` (`skeleton/obs/`) + halaman `osc_site/.../OBS/`.
- **Agen:** biner per-VM di **`osc_auto/agent_vm`** (capability `metrics` +
  `vmhost` + `service`) + image container; registrasi ke grup `/rest/agent`.
  **Tidak mengakses DB** — `osc_rest` penghubung tunggal.
- **Tanpa expose publik:** agen konek keluar ke hub (fire-and-forget + WS).

## 5. Sumber Metrik

| Domain | Sumber | Catatan |
|---|---|---|
| CPU/memori/load/temp/fan/baterai | `gopsutil` (`github.com/shirou/gopsutil/v4`) | Tambah dependency Go baru. |
| Disk kapasitas/I-O | `gopsutil/disk` | Per partisi/device. |
| S.M.A.R.T. | sysfs `/sys`; `smartctl` bila ada | `smart_healthy`, `wear`, `temp`. |
| ZFS | `zfs` CLI / `/proc` | Opsional. |
| Btrfs | `btrfs` CLI/ioctl | Pool/subvolume, `scrub`, usage (opsional). |
| eMMC wear/EOL | sysfs (`life_time`, `pre_eol_info`) | Wear & EOL per device. |
| mdraid | `/proc/mdstat`, `mdadm --detail` | Status/health array. |
| systemd service | D-Bus `systemd` + `journald` | Status, restart, CPU/mem, log unit. |
| GPU | `nvidia-smi` / sysfs / `rocm-smi` | Opsional, bertahap. |
| Container | Docker/Podman Engine API (`pod_engine`, `dockerclient`) | Reuse `POD`. |
| VM host & guest | **Incus/LXD** (`incus`/`lxc`) — prioritas; libvirt, Proxmox, VMware, XCP-ng menyusul | Capability `vmhost`; deteksi via `systemd-detect-virt`. |
| Network probe | agent (`ping`/TCP dial/HTTP/DNS) | ICMP butuh `CAP_NET_RAW`. |

- Status lingkungan: **Docker 29.8.0**, **Compose v5.5.1**, **Podman belum
  terpasang**. Agent jalan sebagai root/grup `docker` untuk akses socket.

## 6. Model Database — cluster `obs_*`

### 6.1 Sudah ada

| Model | Isi |
|---|---|
| `obs_metric` | Sampel metrik time-series (`source`, `name`, `value`, `unit`, `labels`, `recorded_at`). |
| `obs_log` | Log terpusat (`source`, `level`, `message`, `context`). |
| `obs_alert` | Event alert (`severity`, `condition`, `status` FIRING/ACK/RESOLVED). |

### 6.2 Baru (monitoring Beszel)

| Model | Isi pokok | Kunci |
|---|---|---|
| `obs_system` | Host terdaftar: `code`, `name`, `host`, `os`, `arch`, `kernel`, `cpu_cores`, `cpu_model`, `mem_total_mb`, `swap_total_mb`, `agent_version`, `connection` (AGENT/SSH/LOCAL), `agent_id`, `status` (UP/DOWN/PAUSED/PENDING), `last_seen`, `is_active` | `@@unique([company_id, code])` |
| `obs_metric` (perluas) | Tambah `system_id`, `metric` (cpu/mem/disk/net/load/temp/...), `subkey` (device/partisi). Tetap telemetry beretensi | indeks `[system_id, metric, recorded_at]` |
| `obs_metric_rollup` | Agregat per jam/hari (`system_id`, `metric`, `bucket`, `avg`, `min`, `max`, `count`) untuk retensi panjang | `@@unique([system_id, metric, bucket])` |
| `obs_disk` | Partisi/device: `mount`, `fstype` (EXT4/XFS/**BTRFS**/ZFS/…), `device`, `pool`?, `size_mb`, `used_mb`, `smart_healthy`, `smart_temp_c`, `wear_pct`, `emmc_life_time`?, `emmc_pre_eol`?, `mdraid_state`?, `mdraid_level`?, `scrub_state`? (Btrfs/ZFS), `collected_at` | `@@unique([system_id, mount])` |
| `obs_container_stat` | Sampel per container: `engine_id`, `external_id`, `name`, `image`, `state`, `health` (HEALTHY/UNHEALTHY/STARTING/NONE), `restart_count`, `cpu_pct`, `mem_mb`, `mem_limit_mb`, `net_rx`, `net_tx`, `block_read`, `block_write`, `recorded_at` | indeks `[engine_id, external_id, recorded_at]` |
| `obs_vmhost` | Info hypervisor per sistem: `system_id`, `hypervisor` (KVM/PROXMOX/INCUS/VMWARE/XCPNG), `version`, `cluster`, `cpu_cores`, `mem_total_mb`, `vm_count`, `collected_at` | `@@unique([system_id])` |
| `obs_vm` | VM guest terdaftar: `system_id`, `external_id` (uuid/VMID), `name`, `state`, `vcpu`, `mem_mb`, `disk_mb`, `node`, `guest_type`, `vms_guest_id`? (taut `VMS`), `last_seen` | `@@unique([system_id, external_id])` |
| `obs_vm_stat` | Sampel per VM: `vm_id`, `cpu_pct`, `mem_mb`, `net_rx`, `net_tx`, `block_read`, `block_write`, `recorded_at` | indeks `[vm_id, recorded_at]` |
| `obs_check` | Monitor: `code`, `name`, `type` (ICMP/TCP/HTTP/**WS**/DNS/**KEYWORD**/**JSON**/**PUSH**/**CERT**/**DOMAIN**/**GRPC**/**MQTT**/**MYSQL**/**MARIADB**/**POSTGRES**/**MONGODB**/**REDIS**/**SMTP**/**RADIUS**), `target`, `port`?, `driver`? (DB engine), `interval_sec`, `timeout_ms`, `expected`?, `keyword`?/`json_path`?, `dns_record_type`? (DNS: A/AAAA/CNAME/MX/TXT/NS/SRV/…), `http_options` (Json: method/headers/body/auth/status_range/max_redirects/tls_verify/cache_buster), `proxy` (Json: HTTP/SOCKS), `push_token`? (PUSH), `cert_web_certificate_id`?/`domain`? (CERT/DOMAIN), `group_id`?, `parent_id`? (dependensi), `tags` (Json), `retries`, `upside_down` (Bool), `is_active`, `status` (UP/DOWN), `response_ms`, `loss_pct`, `last_checked_at` | `@@unique([company_id, code])` |
| `obs_check_group` | Grup monitor: `code`, `name`, `order`, `is_active` | `@@unique([company_id, code])` |
| `obs_check_result` | Riwayat probe: `check_id`, `ok`, `response_ms`, `loss_pct`, `status_code`, `error`, `recorded_at` | indeks `[check_id, recorded_at]` |
| `obs_alert_rule` | Aturan: `name`, `scope` (SYSTEM/CONTAINER/DEVICE/INTERFACE/**SERVICE**/**DISK**/CHECK), `subject_id`?, `metric`, `comparator` (GT/GTE/LT/LTE), `threshold`, `duration_sec`, `severity`, `is_active`, `notify_ids` (Json) | `@@unique([company_id, name])` |
| `obs_dashboard` | Dashboard kustom: `code`, `name`, `layout` (Json widget), `is_default`, `owner_id`? | `@@unique([company_id, code])` |
| `obs_report` | Laporan terjadwal: `name`, `kind` (PDF/XLSX), `scope` (Json), `schedule` (cron via `JMS`), `last_file`, `generated_at` | `@@unique([company_id, name])` |
| `obs_notification` | Kanal: `name`, `type` (EMAIL/**SMTP**/WEBHOOK/NTFY/TELEGRAM/SLACK/DISCORD/**GOTIFY**/**PUSHOVER**/**TEAMS**/**MATRIX**/**MATTERMOST**/**PUSHBULLET**/**SIGNAL**/**TWILIO**/…), `config` (Json, terenkripsi), `is_active` | `@@unique([company_id, name])` |
| `obs_silence` | Jendela peredam: `name`, `starts_at`, `ends_at`, `scope`, `subject_id` | opsional |
| `obs_maintenance` | **Maintenance window**: `name`, `scope` (SYSTEM/CHECK/DEVICE/…), `subject_id`?, `starts_at`, `ends_at`, `recurrence` (cron/once), `suppress_alerts` (Bool), `is_active` | `@@unique([company_id, name])` |
| `obs_status_page` | **Status page**: `code`, `name`, `slug` (unik), `custom_domain`? (unik), `is_public` (Bool), `title`, `description`?, `theme`?, `badge_enabled` (Bool), `badge_label`?, `is_active` | `@@unique([company_id, slug])` |
| `obs_status_page_item` | Item status page: `page_id`, `group`?, `label`, `check_id`?, `system_id`?, `metric`?, `order`, `is_active` | indeks `[page_id, order]` |
| `obs_status_page_incident` | **Insiden/pengumuman** status page: `page_id`, `title`, `body`, `status` (INVESTIGATING/IDENTIFIED/MONITORING/RESOLVED/SCHEDULED), `impact` (NONE/MINOR/MAJOR/CRITICAL/MAINTENANCE), `is_announcement` (Bool), `starts_at`, `resolves_at`?, `published_at` | indeks `[page_id, starts_at]` |
| `obs_service` | **systemd unit** per sistem: `system_id`, `unit`, `description`?, `active_state` (ACTIVE/INACTIVE/FAILED/…), `sub_state`?, `enabled` (Bool), `restart_count`, `memory_mb`?, `cpu_pct`?, `status` (UP/DOWN/DEGRADED), `last_change_at`, `collected_at` | `@@unique([system_id, unit])` |
| `obs_import_job` | **Import/migrasi**: `source` (UPTIME_KUMA), `status` (PENDING/RUNNING/DONE/FAILED), `payload` (Json), `result` (Json), `error`?, `started_at`, `finished_at` | indeks `[company_id, status]` |

Relasi inti:

```text
obs_system (1) ──► (N) obs_metric · obs_disk · obs_container_stat · obs_service
obs_system (1) ──► (1) obs_vmhost ──► (N) obs_vm ──► (N) obs_vm_stat
obs_system (1) ──► (N) obs_check ──► obs_check_result
obs_check_group (1) ──► (N) obs_check ──(parent)──► obs_check (suppress anak)
obs_alert_rule (1) ──► (N) obs_alert      obs_notification (N) ──► aturan (N)
obs_maintenance ──(suppress)──► obs_alert   obs_status_page (1) ──► (N) obs_status_page_item
obs_status_page (1) ──► (N) obs_status_page_incident
obs_status_page_item ──► obs_check / obs_system   (CERT/DOMAIN check ◄── web_certificate / web_domain)
obs_import_job ──(membuat)──► obs_check / obs_notification / obs_status_page
bot_agent (BOT) ◄── obs_system.agent_id   pod_engine (POD) ◄── obs_container_stat.engine_id
```

> `obs_metric`/`obs_container_stat`/`obs_vm_stat`/`obs_check_result`/`obs_log` =
> time-series beretensi (lihat §10). Data referensi (`obs_system`, `obs_service`,
> `obs_vmhost`, `obs_vm`, `obs_alert_rule`, `obs_notification`,
> `obs_status_page_incident`, `obs_import_job`) persisten.
> Journal systemd disimpan di `obs_log` (`source=systemd`).

## 7. Backend (osc_rest)

Struktur: `osc_rest/skeleton/obs/` (`obs_handler.go`, `obs_usecase.go`,
`obs_repository.go`, `obs_template.go`) + `mechanic/metrics/` (collector &
evaluator) + agen di **`osc_auto/agent_vm`** (biner agent, capability `metrics`
+ **`vmhost`**).

### 7.1 Endpoint UI (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("OBS","POST")`)

| Area | Endpoint |
|---|---|
| Dashboard | `GET /rest/pages/OBS/overview` (ringkasan semua sistem) |
| Sistem | `GET/POST /OBS/systems`, `GET/PUT/DELETE /OBS/systems/:id`, `POST /OBS/systems/:id/ping` |
| Metrik | `GET /OBS/systems/:id/metrics?range=&metric=` |
| Disk | `GET /OBS/systems/:id/disks` (termasuk Btrfs/ZFS/eMMC/mdraid) |
| Service (systemd) | `GET /OBS/systems/:id/services`, `GET /OBS/services/:id/logs?range=` |
| Container | `GET /OBS/containers`, `GET /OBS/containers/:engineId/:id/stats` |
| VM host | `GET /OBS/systems/:id/vmhost`, `GET /OBS/vms`, `GET /OBS/vms/:id/stats?range=` |
| Check | `GET/POST /OBS/checks`, `GET/PUT/DELETE /OBS/checks/:id`, `POST /OBS/checks/:id/run` |
| Check group | `GET/POST /OBS/check-groups`, `PUT/DELETE /OBS/check-groups/:id` |
| Alert rule | `GET/POST /OBS/alert-rules`, `GET/PUT/DELETE /OBS/alert-rules/:id` |
| Alert event | `GET /OBS/alerts`, `POST /OBS/alerts/:id/ack`, `POST /OBS/alerts/:id/resolve` |
| Notifikasi | `GET/POST /OBS/notifications`, `PUT/DELETE /OBS/notifications/:id`, `POST /OBS/notifications/:id/test` |
| Dashboard kustom | `GET/POST /OBS/dashboards`, `PUT/DELETE /OBS/dashboards/:id` |
| Laporan | `GET/POST /OBS/reports`, `POST /OBS/reports/:id/run`, `GET /OBS/reports/:id/download` |
| Status page | `GET/POST /OBS/status-pages`, `PUT/DELETE /OBS/status-pages/:id`, `.../:id/items` |
| Status page insiden | `GET/POST /OBS/status-pages/:id/incidents`, `PUT/DELETE /OBS/status-pages/:id/incidents/:incidentId` |
| Status page publik | `GET /rest/guest/status/:slug` (tanpa login, hanya monitor `is_public`) |
| Badge publik | `GET /rest/guest/status/:slug/badge.svg` (badge uptime SVG) |
| Import/migrasi | `POST /OBS/import/uptime-kuma`, `GET /OBS/import/jobs`, `GET /OBS/import/jobs/:id` |
| Ekspor Prometheus | `GET /rest/metrics` (format Prometheus, opsional token/basic-auth) |
| Maintenance | `GET/POST /OBS/maintenance`, `PUT/DELETE /OBS/maintenance/:id` |
| Settings | `GET/PUT /OBS/settings` (retensi, interval default) |

### 7.2 Endpoint agent (grup `/rest/agent`, `USBots()`)

| Endpoint | Fungsi |
|---|---|
| `POST /rest/agent/obs/register` | Registrasi/klaim agent → `bot_agent` + `obs_system`. |
| `POST /rest/agent/obs/ingest` | Kirim batch metrik/disk/container/**service (systemd)**/**vmhost+VM** (ringkas). |
| `GET  /rest/agent/obs/ws` | Kanal WebSocket stream/heartbeat (opsional); mode **real-time ~1s** untuk sistem terpilih. |
| `POST /rest/agent/obs/check-result` | Kirim hasil probe jaringan. |
| `POST /rest/agent/obs/heartbeat` | Denyut + status (`bot_heartbeat`). |

### 7.3 Evaluasi & notifikasi
- Evaluator periodik (goroutine / `cron` in-process): bandingkan metrik terbaru
  vs `obs_alert_rule` (duration & threshold) → buat/naikkan `obs_alert`.
  Scope tambahan: **SERVICE** (systemd failed/restart) & **DISK** (Btrfs/eMMC/mdraid).
- Pengiriman ke `obs_notification` (SMTP/webhook/HTTP API + kanal luas), retry +
  rate-limit; `config` rahasia tidak dikembalikan mentah.
- **Worker import** (Uptime Kuma) berjalan async → mengisi `obs_import_job`.
- Semua mutasi UI dicatat ke `USLogs` (`app_user_action`).

## 8. Frontend (osc_site)

| Kode | Halaman |
|---|---|
| `OBS01` | **Dashboard** — kartu tiap sistem + sparkline (recharts), status, alert aktif |
| `OBS02` | **Systems** — daftar host, tambah/uji koneksi, status |
| `OBS03` | **System detail** — grafik CPU/mem/disk/net/load/temp, disk/SMART, **Btrfs/ZFS**, **eMMC wear/EOL**, **mdraid**, GPU, toggle **real-time ~1s** |
| `OBS04` | **Containers** — stats per container, **restart count & health** (filter engine dari `POD`) |
| `OBS05` | **Network monitors** — daftar check (grup/tag/dependensi) + riwayat response/loss; opsi HTTP, **WS**, **DB per-engine**, **SMTP/Radius**, **DNS record-type**, **proxy** |
| `OBS06` | **Alerts** — aturan + event (ack/resolve) |
| `OBS07` | **Notifications** — kanal (email/webhook/ntfy/Telegram/Slack/Discord/**Gotify/Pushover/Teams/Matrix/Mattermost/Pushbullet/Signal/Twilio/…**) + uji kirim |
| `OBS08` | **Settings** — retensi, preferensi, mode real-time, **import/ekspor migrasi Uptime Kuma** |
| `OBS09` | **VM host & guests** — hypervisor + daftar/grafik VM guest (tautan `VMS`) |
| `OBS10` | **Reports** — laporan PDF/Excel terjadwal + dashboard kustom |
| `OBS11` | **Status pages** — susun halaman status publik (uptime per monitor), **insiden/pengumuman**, **custom domain**, **badge publik** |
| `OBS12` | **Maintenance** — jendela pemeliharaan terjadwal (peredam alert) |
| `OBS13` | **Services (systemd)** — daftar unit/systemd: status, CPU/mem, restart, log journal |

**Reuse:** `recharts` (grafik, sudah ada), `@/uix/datatable`, `@/lib/grid`,
pola satu halaman + tab (seperti `APP02`/`APP04`), `/proxy/pages/*`,
`src/lib/ws.ts` (`useSocket`) untuk stream bila diperlukan.

## 9. Keamanan & RBAC

- **Least privilege agent:** biner agent sedapat mungkin **rootless**; akses
  socket Docker/Podman hanya bila container stats diaktifkan.
- **Token agent:** kredensial `bot_agent` (hash), rotasi; komunikasi via TLS.
- **Isolasi tenant:** semua query difilter `company_id` — cegah **IDOR**
  (pelajaran dari CVE Beszel: ID sistem dari URL harus divalidasi kepemilikan).
- **Validasi ID container:** sanitasi `external_id` sebelum diteruskan ke
  Engine API (pelajaran dari CVE path traversal Beszel).
- **Ingest terbatas:** rate-limit, ukuran payload, kuota per agent.
- **Notifikasi:** rahasiakan `config` (SMTP password/token API Gotify/Pushover/
  Twilio/Signal, dll.) — simpan terenkripsi, jangan dikembalikan mentah ke klien.
- **Proxy & auth check:** kredensial `http_options`/`proxy` disimpan rahasia;
  toggle verifikasi TLS tetap tunduk kebijakan admin.
- **Import:** berkas/PAYLOAD import Uptime Kuma divalidasi (ukuran, tipe,
  whitelist field) sebelum membuat monitor/kanal.
- **Login hub:** **2FA/TOTP** memakai mekanisme platform OmniSight (`USAuth`),
  bukan sistem terpisah — konsisten dengan modul lain.
- **RBAC:** lihat: `VIEW`; ubah sistem/aturan/kanal: `POST`.

## 10. Retensi & Rollup

- `obs_metric` (raw) → agregasi `obs_metric_rollup` lalu purge (mis. 30 hari,
  `RE_DAYS_OBS_METRIC`).
- `obs_container_stat` → purge lebih pendek (mis. 14 hari).
- `obs_vm_stat` → mis. 14–30 hari (host & guest hypervisor).
- `obs_check_result` → mis. 30 hari.
- `obs_log` → 90 hari (sudah ada di `retention.go`).
- `obs_metric_rollup` → disimpan lebih lama (mis. 1 tahun).
- `obs_alert` (event) & data referensi → persisten.
- `obs_status_page`/`obs_status_page_item`/`obs_status_page_incident`/
  `obs_maintenance`/`obs_silence` → persisten (konfigurasi/konten, bukan telemetry).
- `obs_disk`/`obs_service` → snapshot terbaru (upsert); riwayat via `obs_metric`
  (subkey device/unit) & journal via `obs_log`.
- `obs_import_job` → retensi singkat (mis. 30 hari).

## 11. Integrasi Lintas-Modul

- **POD** ([app_pod.md](app_pod.md)) — sumber daftar engine & container
  (`pod_engine`), reuse `mechanic/dockerclient` untuk stats.
- **BOT** — registrasi agent & heartbeat (`bot_agent`, `bot_heartbeat`).
- **VMS** — `obs_vmhost`/`obs_vm` bertaut ke `vms_host`/`vms_guest` (inventaris
  hypervisor & VM); metrik melengkapi temuan/kapasitas.
- **NET** — data jaringan host melengkapi topologi; probe saling melengkapi.
- **WEB** ([app_web.md](app_web.md)) — check **CERT/DOMAIN expiry** memakai data
  `web_certificate`/`web_domain`; status page menampilkan uptime site.
- **JMS** — opsional: penjadwalan evaluator/rollup/laporan/expiry berkala.
- **APP06** ([app_sys.md](app_sys.md)) — dispatcher notifikasi admin; `OBS`
  dapat menyalurkan/menyinkronkan kanal & pesan alert ke `app_notify_channel`.
- **APP (auth)** ([app_sys.md](app_sys.md)/USAuth) — **2FA/TOTP** & SSO hub
  memakai auth platform OmniSight, bukan sistem terpisah.
- **Import Uptime Kuma** — migrasi opsional monitor/kanal/status page dari
  instalasi uptime-kuma yang ada.

## 12. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Fondasi** | Model `obs_*` (baru) + migrasi; agen **`osc_auto/agent_vm`** + ingest; registrasi agen (`bot_agent`); CRUD `obs_system`; metrik CPU/mem. |
| **B. Historis & UI** | Rollup + retensi; halaman `OBS01`–`OBS03`; grafik; disk/SMART; **Btrfs**, **eMMC wear/EOL**, **mdraid** (`obs_disk`). |
| **C. Container** | `obs_container_stat` (+ **restart count/health**) + halaman `OBS04` (reuse `dockerclient` POD). |
| **C2. VM host & guest** | Capability agen **`vmhost`**: deteksi hypervisor (**Incus/LXD** dulu; lainnya menyusul); `obs_vmhost`/`obs_vm`/`obs_vm_stat` + halaman `OBS09`; taut `VMS`. |
| **D. Alert & notifikasi** | `obs_alert_rule`, evaluator, `obs_alert`, `obs_notification` (**kanal luas**: Gotify/Pushover/Teams/Matrix/Mattermost/Pushbullet/Signal/Twilio) + uji kirim; halaman `OBS06`–`OBS07`. |
| **E. Network monitor & fleet** | `obs_check`/`obs_check_result`; deploy agent massal via `BOT`; SSH-pull opsional. |
| **E2. Alert lanjutan & device** | Scope **CONTAINER** (down/restart-loop), **DEVICE/INTERFACE** (SNMP `NET`), **SERVICE** (systemd failed/restart); integrasi alert `SEC`. |
| **E3. Status & expiry** | `obs_status_page` (+ item, publik), **insiden/pengumuman** (`obs_status_page_incident`), **custom domain**, **badge publik**, `obs_maintenance` (silence); tipe check **KEYWORD/JSON/PUSH**; **CERT/DOMAIN expiry** (integrasi `WEB`); halaman `OBS11`–`OBS12`. |
| **E4. Monitor lanjutan** | `obs_check_group` + **dependensi induk→anak** (suppress), **tag**, **retry/upside-down**; **opsi HTTP lanjutan** (`http_options`), tipe **WS**, **DB per-engine** (MYSQL/MARIADB/POSTGRES/MONGODB/REDIS), **SMTP/RADIUS**, **DNS record-type**, **proxy per-monitor**; tipe **GRPC/MQTT**; **ekspor Prometheus** (`/rest/metrics`). |
| **E5. Service & real-time** | `obs_service` (systemd) + kolektor D-Bus/`journald` + halaman `OBS13`; **mode real-time ~1s** (WS opsional). |
| **E6. Migrasi** | Importir opsional **Uptime Kuma** (`obs_import_job`) untuk monitor/kanal/status page. |
| **F. Polish** | GPU/ZFS/fan/baterai, **dashboard kustom** (`obs_dashboard`), **laporan** PDF/Excel (`obs_report`), OAuth/OIDC opsional, **2FA/TOTP** via platform `USAuth`, dokumentasi, test. |

## 13. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Pertumbuhan data time-series | Rollup + retensi + indeks tepat. |
| IDOR / akses lintas tenant | Wajib filter `company_id`; validasi kepemilikan di semua endpoint. |
| Path traversal pada ID container | Sanitasi + allowlist karakter sebelum Engine API. |
| Agent berbahaya / token bocor | TLS, token rotasi, kuota, least privilege, audit. |
| Beban hub saat banyak agent | Batch ingest, rate-limit, agregasi di agent. |
| Kredensial notifikasi bocor | Simpan terenkripsi, jangan kembalikan mentah. |
| Volume log journal systemd membengkak | Batasi unit terpilih & level; retensi `obs_log` + filter. |
| Mode real-time (~1s) membebani hub | Opt-in per sistem, batasi rate/stream, fallback ke interval. |
| Import membawa data tak valid | Validasi payload & whitelist field sebelum menyimpan. |
| Kredensial proxy/auth check bocor | Simpan terenkripsi, mask di respons, audit akses. |

## 14. Non-Goals

- **APM / tracing distribusi** (span, trace) dan **log-fulltext search engine
  (ELK/Loki)** — **non-goal**; `OBS` fokus metrik/health/uptime, bukan APM.
- **Uptime-Kuma niche checks** — Steam game server, Kafka, RabbitMQ, SQL Server,
  Tailscale-ping, Globalping — **non-goal**; cukup tipe check yang sudah
  ditetapkan (HTTP/TCP/PING/KEYWORD/JSON/PUSH/CERT/DOMAIN/GRPC/MQTT/DB/SMTP/RADIUS/WS).
- **Synthetic browser testing** (headless browser user-journey) — **non-goal**.
- **Log analytics penuh / anomali ML** — **non-goal**; log mentah ada di
  `obs_log` dengan retensi pendek, analitik mendalam ranah `SEC`.

## 15. Keputusan yang Perlu Dikonfirmasi

- [x] Kode modul **`OBS`** (Beszel digabung ke OBS).
- [x] Prefix cluster **`obs_*`**.
- [x] Agen: biner per-VM di **`osc_auto/agent_vm`** (bukan di `osc_rest`); agen
  tidak mengakses DB, `osc_rest` penghubung tunggal.
- [ ] Transport agen: **push WebSocket** (usulan) vs **SSH-pull** vs keduanya?
- [ ] **Podman** didukung sejak Fase A atau menyusul?
- [x] Alert notifikasi: **kanal luas** (webhook, email/SMTP, ntfy, Telegram,
  Slack, Discord, Gotify, Pushover, Microsoft Teams, Matrix, Mattermost,
  Pushbullet, Signal, Twilio, …) — bukan hanya webhook/email.
- [ ] Butuh **OAuth/OIDC** atau cukup auth OmniSight?
- [x] **VM host & guest** dimonitor oleh agen (`vmhost`).
- [x] Alert scope diperluas: **CONTAINER (down/restart-loop)**, **DEVICE/INTERFACE**
  (SNMP `NET`), **SERVICE** (systemd), **DISK** (Btrfs/eMMC/mdraid), selain SYSTEM/CHECK.
- [x] **Dashboard kustom** (`obs_dashboard`) & **laporan** PDF/Excel (`obs_report`).
- [x] **Status page publik** (`obs_status_page`) & **maintenance window**
  (`obs_maintenance`) — ala uptime-kuma.
- [x] Tipe monitor lanjutan: **KEYWORD/JSON/PUSH** + **CERT/DOMAIN expiry**
  (integrasi [WEB](app_web.md)); **GRPC/MQTT** + **DB per-engine**
  (MYSQL/MARIADB/POSTGRES/MONGODB/REDIS) + **SMTP/RADIUS** + **DNS record-type**.
- [x] **Grup & dependensi monitor** (`obs_check_group` + `parent_id`), **tag**,
  **retry/upside-down**, dan **ekspor Prometheus** (`/rest/metrics`).
- [x] Hypervisor prioritas Fase A: **Incus/LXD**; libvirt/KVM, Proxmox VE,
  VMware, XCP-ng menyusul.
- [x] **Opsi HTTP lanjutan** (`http_options`), **WS**, **DB per-engine**,
  **SMTP/Radius**, **DNS record-type**, dan **proxy per-monitor**.
- [x] **systemd service** (`obs_service` + kolektor D-Bus/`journald`).
- [x] **Btrfs**, **eMMC wear/EOL**, **mdraid** melengkapi `obs_disk`.
- [x] **Restart count/health** pada `obs_container_stat`.
- [x] **Mode real-time ~1s** (stream WS opsional).
- [x] **Status page**: insiden/pengumuman, **custom domain**, **badge publik**.
- [x] **2FA/TOTP** mewarisi auth platform OmniSight (`USAuth`).
- [ ] **Import Uptime Kuma**: aktif default atau opt-in per tenant?
- [ ] Tautkan otomatis ke `VMS` (`vms_host`/`vms_guest`) atau tabel `obs_vm` sendiri?

## 16. Referensi Internal (aset yang bisa dipakai ulang)

- WebSocket proxy pola: `osc_rest/mechanic/sshproxy.go`.
- Route & grup: `osc_rest/backbone/routes.go` (`pages`, `admin`, `agent`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Retensi: `osc_rest/backbone/retention.go`.
- Klien Engine (rencana): `mechanic/dockerclient` (lihat [app_pod.md](app_pod.md)).
- Agen per-VM: **`osc_auto/agent_vm`** (capability `metrics` + **`vmhost`**;
  backend = penghubung DB).
- Grafik: `recharts` (sudah ada di `osc_site`).
- Konvensi cluster DB: `osc_base/prisma/schema/cluster_*.prisma`,
  [database/README.md](../database/README.md).
- Agent/heartbeat: model `bot_agent`, `bot_heartbeat` (`cluster_bot.prisma`).
- Notifikasi/dispatcher admin: `mechanic/notify/` ([app_sys.md](app_sys.md),
  APP06).
- systemd/journald: D-Bus `org.freedesktop.systemd1` + journal API.
- Storage: CLI `btrfs`/`mdadm` + sysfs eMMC (`/sys/.../mmc*`).
- Import Uptime Kuma: format ekspor bawaan uptime-kuma (JSON).
