# Osc_base — `prisma/schema/cluster_vms.prisma`

> Dokumen detail cluster **VMS** — VM & Hypervisor Management (`vms_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster VMS menyimpan inventaris hypervisor, guest VM, dan temuan kerentanan —
diperluas menjadi **manajemen VM** (siklus hidup, provisioning, firewall,
cluster/HA, SDN, penyimpanan, backup).

## 2. Model

### 2.1 `vms_host`
- `@@unique([company_id, code])`; `hypervisor` ∈ `VMWARE | HYPERV | PROXMOX | KVM | OTHER`.
- Kapasitas: `cpu_cores`, `ram_mb`, `storage_gb`.
- Manajemen: `agent_id`? (→ `bot_agent`), `vendor`, `api_endpoint`, `api_mode` ∈
  `API | SSH | AGENT`, `secret_enc`, `managed` (+ `cpu_used`, `ram_used_mb`,
  `storage_used_gb`, `uptime_sec`); **`cluster_id`?** (→ `vms_cluster`, ganti
  string `cluster` bebas), **`pool_id`?** (→ `vms_pool`).

### 2.2 `vms_guest`
- `@@unique([host_id, code])`; `onDelete: Cascade` dari `vms_host`.
- `power_state` ∈ `ON | OFF | SUSPENDED`.
- `guest_type` ∈ `VM | CONTAINER`; `external_id`, `node`, `template` (Bool),
  `agent_status`, **`agent_version`**.
- **Boot/startup**: `autostart` (Bool) + **`boot_order`** (Json),
  **`startup_order`/`startup_delay_sec`/`shutdown_timeout_sec`**.
- **Hotplug** (Json: disk/nic/cpu/mem Bool); **cloud-init** `cloud_init`
  (user-data), **`cloud_init_meta`**, **`cloud_init_network`** (TEXT).

### 2.3 `vms_finding`
- Temuan dapat menempel ke `host_id` dan/atau `guest_id` (opsional).
- `severity` ∈ `LOW | MEDIUM | HIGH | CRITICAL`; `status` ∈ `OPEN | ACK | RESOLVED`;
  `cve`, `detected_at`, `resolved_at`.

### 2.4 `vms_snapshot`
- `kind` ∈ `SNAPSHOT | RAM | LIVE`; `vmstate`/`live_state` (Bool) → snapshot
  menyertakan **RAM/live-state**.
- `parent`? (rantai), `size_bytes`, `state`, `ros_ref`; indeks `[guest_id]`.

### 2.5 `vms_task`
- `action` ∈ `START | STOP | REBOOT | SUSPEND | CLONE | SNAPSHOT_RESTORE |
  RESIZE | MIGRATE | DELETE | HOTPLUG | PASSTHROUGH | FIREWALL | SDN | POOL |
  CLUSTER | HA | REPLICATION | CONFIG_RAW | AGENT_EXEC | AGENT_INSTALL |
  MOVE_DISK | BULK`; `status` ∈ `QUEUED | RUNNING | SUCCESS | FAILED`.
- `bulk_id`? untuk grup **power bulk**; `host_id`?/`guest_id`?, `message`,
  `user_id`, `started_at`, `finished_at`.

### 2.6 `vms_nic`
- `bridge`, `vlan`?, **`vnet`?** (→ `vms_sdn`), `mac`, `model`, `ip_address`?,
  `dhcp` (Bool), `state`; `@@unique([guest_id, name])`.

### 2.7 `vms_storage` & `vms_iso`
- `vms_storage`: `driver` (DIR/ZFS/LVM/CEPH/…), `type`, `size_gb`, `used_gb`,
  `content` (Json); `@@unique([host_id, name])`.
- `vms_iso`: `storage_id`?, `path`, `os_hint`, `size_bytes`, `kind`
  (`ISO | TEMPLATE | IMAGE`); `@@unique([host_id, name])`.

### 2.8 `vms_backup`
- `kind` ∈ `SNAPSHOT | EXPORT`; `schedule_id`? (→ `JMS`), `storage_id`?, `path`,
  `size_bytes`, `status`.
- **Retensi/verifikasi/enkripsi**: `retention_days`?, `verify` (Bool),
  `verify_state` ∈ `NONE | OK | FAIL`, `encrypted` (Bool), `enc_key_id`?,
  `compression` ∈ `NONE | LZO | ZSTD | GZIP`.

### 2.9 `vms_fw_rule` & `vms_security_group` (**MAJOR**)
- `vms_fw_rule`: `guest_id`?/`host_id`?, `direction` ∈ `IN | OUT`, `action` ∈
  `ACCEPT | DROP | REJECT`, `proto`, `sport`?/`dport`?, `source`?/`dest`?,
  `order`, `enabled`, `comment`, `sg_id`? (→ `vms_security_group`).
- `vms_security_group`: `name`, `description`, `default_action`, `rules` (Json);
  `@@unique([company_id, name])`.

### 2.10 `vms_sdn` & `vms_pool`
- `vms_sdn`: `zone`, `vnet`, `type` ∈ `BRIDGE | VLAN | VXLAN | EVPN`, `vxlan_id`?,
  `bridge`, `subnet`?, `gateway`?, `state`; `@@unique([host_id, vnet])`.
- `vms_pool` (resource pool hypervisor-side): `parent_id`?, `cpu_limit`,
  `mem_limit_mb`, `storage_limit_gb`, `permissions` (Json);
  `@@unique([company_id, name])`.

### 2.11 `vms_cluster` & `vms_node`
- `vms_cluster`: `name`, `quorum_status`, `total_votes`, `expected_votes`,
  `corosync` (Json).
- `vms_node`: `cluster_id`, `host_id`?, `node_name`, `role` ∈ `MASTER | NODE`,
  `ring0_addr`, `votes`, `quorum` (Bool), `state`; `@@unique([cluster_id, node_name])`.

### 2.12 `vms_ha`, `vms_replication`, `vms_passthrough`
- `vms_ha`: `enabled`, `mode` ∈ `AUTO_RESTART | MIGRATE`, `max_restart`,
  `restart_delay_sec`, `state`; `@@unique([guest_id])`.
- `vms_replication`: `source_host_id`, `target_host_id`, `scope` ∈ `DISK | NODE`,
  `mode` ∈ `SYNC | ASYNC`, `interval_sec`, `last_sync_at`, `state`.
- `vms_passthrough`: `kind` ∈ `PCI | USB`, `address`?, `vendor_id`?,
  `product_id`?, `mapped` (Bool), `state`.

## 3. Relasi Inti

```text
vms_host (1) ──► (N) vms_guest
    └──► (N) vms_finding ◄── vms_guest (opsional)
vms_cluster (1) ──► (N) vms_node ──► (0..1) vms_host
vms_guest (1) ──► (1) vms_ha
vms_guest (1) ──► (N) vms_fw_rule ──► vms_security_group
vms_host (1) ──► (N) vms_security_group · vms_sdn · vms_pool
vms_guest (1) ──► (N) vms_replication
vms_guest (1) ──► (N) vms_passthrough
```

## 4. Catatan

- Modul `VMS` diproyeksikan menjadi **manajemen VM** (bukan hanya inventaris):
  kolom manajemen pada `vms_host`/`vms_guest` + tabel `vms_snapshot`, `vms_task`,
  `vms_template`, **`vms_nic`** (NIC/bridge/VLAN), **`vms_storage`** (storage pool),
  **`vms_iso`** (ISO/image library), **`vms_backup`** (backup/restore VM),
  **`vms_fw_rule`/`vms_security_group`** (**MAJOR**: firewall per-VM/CT +
  security group), **`vms_sdn`** (zone/VNet/VXLAN/EVPN), **`vms_pool`** (resource
  pool), **`vms_cluster`/`vms_node`** (join/quorum/Corosync), **`vms_ha`** (HA
  manager), **`vms_replication`** (replikasi async), **`vms_passthrough`**
  (PCI/USB) — **belum dibangun**, akses hypervisor via agen (capability `vmhost`,
  prioritas Incus/LXD); termasuk **provisioning** (create VM ISO/template +
  cloud-init user-data/**meta-data**/**network-config**).
  `vms_finding` menerima impor dari `SEC` (`sec_vuln`/`sec_sca_result`).
  Rincian: [../planning/app_vms.md](../planning/app_vms.md).
- `vms_task` (telemetry operasional) masuk daftar retensi
  `osc_rest/backbone/retention.go`; `vms_backup` menyimpan retensi/verifikasi/
  enkripsi.
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
