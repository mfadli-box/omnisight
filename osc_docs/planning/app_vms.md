# Planning `VMS` — VM & Hypervisor Management (+ Security Findings)

> Rencana modul **`VMS`**: dari sekadar **inventaris** menjadi **manajemen
> siklus hidup VM** (start/stop/snapshot/console/clone) melalui hypervisor,
> **plus** penampung **temuan keamanan host/VM** yang dipasok modul
> [SEC](app_sec.md) (ala Wazuh). Bagian dari [Planning](README.md) · Lihat juga
> [blueprint](blueprint.md), [roadmap](roadmap.md), [checklist](checklist.md),
> serta modul terkait [OBS](app_obs.md) (metrik VM), [SEC](app_sec.md) (temuan),
> dan `BOT`/agen.

## 1. Tujuan & Lingkup

Naikkan `VMS` dari inventaris statis menjadi konsol VM:

- **Inventaris** — host hypervisor & guest VM (`vms_host`, `vms_guest`, sudah ada).
- **Siklus hidup VM** — **start/stop/reboot/suspend/resume**, hapus, resize
  (CPU/RAM), **clone**.
- **Pembuatan VM** — **buat VM baru** dari **ISO/template** + **cloud-init**
  (user-data/**meta-data**/**network-config**, kredensial awal).
- **Jaringan** — konfigurasi **NIC/bridge/VLAN** guest (`vms_nic`); **SDN**
  (zone/VNet/VXLAN/EVPN) via driver atau delegasi ke [NET](app_net.md) (lihat §3).
- **Firewall & security group** (**MAJOR**) — aturan firewall **per-VM/CT** +
  **security group** (`vms_fw_rule`, `vms_security_group`) lewat driver hypervisor.
- **Penyimpanan** — **storage pool** (`vms_storage`) & **ISO/image library**
  (`vms_iso`); **pindah disk/migrasi storage** antar pool.
- **Backup/restore VM** — snapshot penuh + ekspor/impor (`vms_backup`,
  terjadwal via `JMS`); **retensi/verifikasi/enkripsi** backup.
- **Snapshot** — buat, daftar, restore, hapus (`vms_snapshot`); opsi
  **RAM/live-state** (`vmstate`).
- **Console** — **VNC/SPICE** ke VM (noVNC di browser) via agen; **SPICE**
  opsional eksperimental (lihat §13).
- **Migrasi** (opsional) — pindah VM antar host dalam cluster.
- **Hotplug** — tambah/hapus **disk/NIC** dan **CPU/RAM** saat VM hidup (di luar
  resize statis).
- **Passthrough** — **PCI/USB** ke guest (`vms_passthrough`).
- **Cluster, HA & replikasi** — manajemen **node join/quorum/Corosync**
  (`vms_cluster`/`vms_node`); **HA manager** auto-restart saat node gagal
  (`vms_ha`); **replikasi async** storage/node (`vms_replication`, bukan migrasi
  live).
- **Resource pool** — pengelompokan & hak akses **hypervisor-side** (`vms_pool`).
- **Konfigurasi lanjutan** — **edit config mentah (raw)** per guest + **urutan
  boot/startup** (di luar `autostart`).
- **Guest agent** — **exec/install** QEMU/LXD guest agent (di luar
  `agent_status`).
- **Operasi massal** — power **bulk** multi-VM (start/stop/reboot/suspend).
- **Monitoring** — status/power + metrik resource; integrasi [OBS](app_obs.md)
  (host & guest) dan [NET](app_net.md).
- **Keamanan** — **temuan host/VM** (`vms_finding`) + impor dari [SEC](app_sec.md)
  (`sec_vuln`, `sec_sca_result`).
- **Hypervisor** — prioritas **Incus/LXD** (selaras [OBS](app_obs.md)); lalu
  libvirt/KVM, Proxmox VE, VMware, Hyper-V/XCP-ng.
- **Multi-tenant** — per `company_id`, RBAC OmniSight.

> **Fokus hypervisor** mengikuti keputusan OBS: **Incus/LXD dulu** (via
> `incus`/`lxc`/REST API), hypervisor lain menyusul. Semua akses via agen.

## 2. Referensi Fitur (Proxmox VE · Incus/LXD · vCenter)

| Area | Referensi | Target `VMS` |
|---|---|---|
| Inventaris host/guest | semua | ✅ (sudah ada) |
| Power lifecycle (start/stop/reboot/suspend) | semua | ✅ |
| Console (VNC/SPICE) | Proxmox, vCenter | ✅ (noVNC) |
| Snapshot/rollback | semua | ✅ |
| Clone/template | Proxmox, vCenter | ✅ |
| Resize CPU/RAM/disk | semua | ✅ |
| Create VM baru (ISO/template) | Proxmox, vCenter | ✅ |
| Cloud-init (user-data/meta-data) | Proxmox, Incus | ✅ |
| Konfig NIC/bridge/VLAN | semua | ✅ |
| Storage pool & ISO/image library | semua | ✅ |
| Backup/restore VM penuh | semua | ✅ (`vms_backup`, jadwal via `JMS`) |
| Migrasi live | Proxmox, vCenter | ❌ non-goal (keputusan) |
| Firewall per-VM/CT + security group | Proxmox, Incus | ✅ **MAJOR** (`vms_fw_rule`/`vms_security_group`) |
| SDN (zone/VNet/VXLAN/EVPN) | Proxmox, Incus | ✅ (via driver atau delegasi ke `NET`) |
| Resource pool | Proxmox, vCenter | ✅ (`vms_pool`) |
| HA manager (auto-restart node) | Proxmox, vCenter | ✅ (`vms_ha`) |
| Replikasi async (storage/node) | Proxmox, Incus | ✅ (`vms_replication`; **bukan** migrasi live) |
| Cluster/node join + quorum/Corosync | Proxmox, Incus | ✅ (`vms_cluster`/`vms_node`) |
| Hotplug disk/NIC + CPU/RAM | Proxmox, vCenter | ✅ |
| Passthrough PCI/USB | Proxmox, vCenter | ✅ (`vms_passthrough`) |
| SPICE console | Proxmox | ⚠️ opsional eksperimental (noVNC default) |
| Raw/advanced config edit | Proxmox, Incus | ✅ |
| Pindah disk / migrasi storage antar pool | Proxmox, vCenter | ✅ |
| Guest agent exec/install (QEMU/LXD) | Proxmox, Incus | ✅ (di luar `agent_status`) |
| Cloud-init meta-data/network-config | Proxmox, Incus | ✅ |
| Backup retention/verify/encryption | Proxmox | ✅ (field `vms_backup`) |
| Snapshot RAM/live-state | Proxmox | ✅ (`vms_snapshot.kind`) |
| Boot/startup order | Proxmox, vCenter | ✅ (di luar `autostart`) |
| Bulk/multi-VM power ops | semua | ✅ |
| Metrik resource | semua | ✅ via `OBS` (`obs_vm`) |
| Temuan keamanan | — | ✅ via `SEC` (`sec_vuln`/`sec_sca_result`) |
| Konsol multi-hypervisor | — | ✅ driver per-hypervisor |

**Referensi alat**: Proxmox VE, Incus/LXD, VMware vCenter, Hyper-V.

## 3. Keputusan Arsitektur (draft — perlu konfirmasi §14)

1. **Kode modul:** `VMS` (diperluas dari inventaris) — halaman `VMS01`.. .
2. **Cluster DB:** `vms_*` (file `cluster_vms.prisma`; perpanjang).
3. **Akses hypervisor:** **selalu via agen** `osc_auto/agent_vm` (capability
   **`vmhost`**, sama dengan `OBS`); backend tidak menyambung langsung.
4. **Driver hypervisor:** abstraction `hypervisorDriver` (`IncusDriver` dulu;
   `LibvirtDriver`/`ProxmoxDriver`/`VMwareDriver` menyusul).
5. **Console:** **noVNC** (browser) — agen membuat proxy VNC dari hypervisor
   (`incus console`/VNC socket), diteruskan lewat WS (pola `sshproxy.go`).
6. **Snapshot & clone:** operasi hypervisor via driver; dicatat `vms_task`.
7. **Audit & aman:** setiap aksi dicatat `USLogs` + `vms_task`; aksi destruktif
   (hapus/restore) konfirmasi (+ opsi approval `APP04`).
8. **Temuan keamanan:** `vms_finding` dipertahankan; **impor/taut** dari `SEC`
   (`sec_vuln`/`sec_sca_result`) dengan referensi host/guest.
9. **Firewall & security group** (**MAJOR**): aturan firewall **per-VM/CT**
   (`vms_fw_rule`) + **security group** (`vms_security_group`) sebagai operasi
   driver (`firewall`) di agen — bukan hanya konfigurasi jaringan pasif.
10. **SDN:** abstraksi **zone/VNet/VXLAN/EVPN** (`vms_sdn`) lewat driver; jika
    di luar cakupan fase awal, **delegasi eksplisit ke `NET`** (bridge/VLAN tetap
    di `vms_nic`).
11. **Resource pool** (`vms_pool`): pengelompokan & hak akses **hypervisor-side**
    (komplemen RBAC OmniSight), bukan pengganti `company_id`.
12. **Cluster/HA/replikasi:** **node join/quorum/Corosync** (`vms_cluster`/
    `vms_node`), **HA manager** auto-restart (`vms_ha`), **replikasi async**
    (`vms_replication`).
13. **Hotplug & passthrough:** tambah/hapus disk/NIC + CPU/RAM saat hidup; PCI/USB
    (`vms_passthrough`) — aksi destruktif/hardware ikut audit.
14. **Konfigurasi lanjutan:** **raw config** per guest + **urutan boot/startup**;
    validasi + audit wajib (raw = risiko).
15. **Backup & snapshot lanjutan:** `vms_backup` menyimpan **retensi/verifikasi/
    enkripsi**; `vms_snapshot.kind` membedakan snapshot biasa vs **RAM/live-state**.
16. **Guest agent & bulk:** `agentExec`/`agentInstall` QEMU/LXD (di luar
    `agent_status`); **power bulk** multi-VM (`vms_task` mencatat tiap target).
17. **Disk move:** pindah disk/migrasi storage **antar pool** (offline/online)
    lewat driver `moveDisk`.
18. **SPICE:** **noVNC tetap default**; SPICE opsional eksperimental (fase lanjut,
    lihat §13).

## 4. Arsitektur & Topologi

```
Browser ──► osc_site (:37773) ──/proxy/pages/VMS/*──► osc_rest (:37772)
                                                         │  orkestrasi + validasi + audit
                                                         └── /rest/agent ──► agent_vm (osc_auto)
                                                                                  │ capability vmhost
                                                                                  └── Incus/LXD · libvirt · Proxmox · VMware
Browser ──WS (noVNC console)──► osc_rest ──proxy──► agent_vm ──VNC──► hypervisor
osc_rest ──pgx──► PostgreSQL (vms_*)
```

- **Backend = penghubung tunggal ke DB**; agen = jalur ke hypervisor, tidak akses DB.
- **Satu capability `vmhost`** dipakai `VMS` (aksi) dan `OBS` (metrik).

## 5. Model Database — cluster `vms_*`

### 5.1 Sudah ada

| Model | Isi |
|---|---|
| `vms_host` | Host hypervisor: `hypervisor` (VMWARE/HYPERV/PROXMOX/KVM/OTHER), kapasitas, status. |
| `vms_guest` | Guest VM: `host_id`, `guest_os`, CPU/RAM/disk, `power_state`, `ip_address`. |
| `vms_finding` | Temuan kerentanan (severity, CVE, status), menempel host/guest. |

### 5.2 Baru (manajemen VM)

| Model | Isi pokok | Kunci |
|---|---|---|
| `vms_host` (perluas) | Tambah: `agent_id`? (→ `bot_agent`/agen pengelola), `vendor`, `api_endpoint`, `api_mode` (API/SSH/AGENT), `username`, `secret_enc`, `cluster`, **`cluster_id`?** (→ `vms_cluster`, ganti string bebas), **`pool_id`?** (→ `vms_pool`), `managed`, `cpu_used`, `ram_used_mb`, `storage_used_gb`, `uptime_sec` | `@@unique([company_id, code])` |
| `vms_guest` (perluas) | Tambah: `external_id` (uuid/VMID), `host_ref`, `node`, `vcpu`, `cpu_pct`, `mem_used_mb`, `disk_used_gb`, `guest_type` (VM/CONTAINER), `template` (Bool), `autostart`, **`boot_order`** (Json), **`startup_order`/`startup_delay_sec`/`shutdown_timeout_sec`**, **`hotplug`** (Json: disk/nic/cpu/mem Bool), `agent_status`, **`agent_version`**, `cloud_init` (TEXT, user-data), **`cloud_init_meta`**, **`cloud_init_network`** (TEXT) | `@@unique([host_id, external_id])` |
| `vms_snapshot` | Snapshot: `guest_id`, `name`, `parent`?, **`kind` (SNAPSHOT/RAM/LIVE)**, **`vmstate` (Bool — sertakan RAM/live-state)**, **`live_state` (Bool)**, `size_bytes`, `state`, `created_at`, `ros_ref` | indeks `[guest_id]` |
| `vms_task` | Jejak tugas/aksi: `host_id`?, `guest_id`?, `action` (START/STOP/REBOOT/SUSPEND/CLONE/SNAPSHOT_RESTORE/RESIZE/MIGRATE/DELETE **+ HOTPLUG/PASSTHROUGH/FIREWALL/SDN/POOL/CLUSTER/HA/REPLICATION/CONFIG_RAW/AGENT_EXEC/AGENT_INSTALL/MOVE_DISK/BULK**), `status` (QUEUED/RUNNING/SUCCESS/FAILED), `message`, **`bulk_id`?** (grup power bulk), `started_at`, `finished_at`, `user_id` | indeks `[company_id, created_at]` |
| `vms_template` | Template VM: `host_id`, `name`, `os`, `source_ref`, `template` (Bool) | `@@unique([host_id, name])` |
| `vms_nic` | NIC guest: `guest_id`, `name`, `bridge`, `mac`, `model`, `vlan`?, **`vnet`?** (→ `vms_sdn`), `ip_address`?, `dhcp` (Bool), `state` | `@@unique([guest_id, name])` |
| `vms_storage` | Storage pool host: `host_id`, `name`, `driver`, `type` (DIR/ZFS/LVM/CEPH/…), `size_gb`, `used_gb`, `content` (Json/disks+iso) | `@@unique([host_id, name])` |
| `vms_iso` | ISO/image library: `host_id`, `storage_id`?, `name`, `path`, `os_hint`, `size_bytes`, `kind` (ISO/TEMPLATE/IMAGE), `uploaded_at` | `@@unique([host_id, name])` |
| `vms_backup` | Backup/restore VM: `guest_id`, `name`, `kind` (SNAPSHOT/EXPORT), `storage_id`?, `path`, `size_bytes`, `status`, **`retention_days`?**, **`verify` (Bool)**, **`verify_state` (NONE/OK/FAIL)**, **`encrypted` (Bool)**, **`enc_key_id`?**, **`compression` (NONE/LZO/ZSTD/GZIP)**, `schedule_id`? (→`JMS`), `created_at`, `created_by` | indeks `[guest_id, created_at]` |
| `vms_fw_rule` (**MAJOR**) | Aturan firewall per host/guest: `guest_id`?/`host_id`?, `direction` (IN/OUT), `action` (ACCEPT/DROP/REJECT), `proto` (TCP/UDP/ICMP/…), `sport`?, `dport`?, `source`?, `dest`?, `order`, `enabled`, `comment`, `sg_id`? (→ `vms_security_group`) | indeks `[guest_id, order]` |
| `vms_security_group` (**MAJOR**) | Security group: `host_id`?/`company_id`, `name`, `description`, `default_action`, `rules` (Json) | `@@unique([company_id, name])` |
| `vms_sdn` | Abstraksi SDN: `host_id`?, `zone`, `vnet`, `type` (BRIDGE/VLAN/VXLAN/EVPN), `vxlan_id`?, `bridge`, `subnet`?, `gateway`?, `state` | `@@unique([host_id, vnet])` |
| `vms_pool` | Resource pool (hypervisor-side): `company_id`, `parent_id`?, `name`, `cpu_limit`, `mem_limit_mb`, `storage_limit_gb`, `permissions` (Json) | `@@unique([company_id, name])` |
| `vms_cluster` | Cluster hypervisor: `company_id`, `name`, `quorum_status`, `total_votes`, `expected_votes`, `corosync` (Json) | `@@unique([company_id, name])` |
| `vms_node` | Node cluster: `cluster_id`, `host_id`?, `node_name`, `role` (MASTER/NODE), `ring0_addr`, `votes`, `quorum` (Bool), `state` | `@@unique([cluster_id, node_name])` |
| `vms_ha` | HA manager: `guest_id`, `enabled`, `mode` (AUTO_RESTART/MIGRATE), `max_restart`, `restart_delay_sec`, `state` | `@@unique([guest_id])` |
| `vms_replication` | Replikasi async: `guest_id`, `source_host_id`, `target_host_id`, `scope` (DISK/NODE), `mode` (SYNC/ASYNC), `interval_sec`, `last_sync_at`, `state` | indeks `[guest_id]` |
| `vms_passthrough` | PCI/USB passthrough: `guest_id`, `kind` (PCI/USB), `address`?, `vendor_id`?, `product_id`?, `mapped` (Bool), `state` | indeks `[guest_id]` |

Relasi inti:

```text
vms_host (1) ──► (N) vms_guest ──► (N) vms_snapshot
                       │                ├── (N) vms_task
                       │                └── (N) vms_backup
                       ├──► (N) vms_nic
                       └──► (N) vms_finding ◄── vms_host (opsional)
vms_host (1) ──► (N) vms_template
vms_host (1) ──► (N) vms_storage ──► (N) vms_iso
vms_finding ◄──(import)── sec_vuln / sec_sca_result (SEC)
vms_cluster (1) ──► (N) vms_node ──► (0..1) vms_host
vms_guest (1) ──► (1) vms_ha
vms_guest (1) ──► (N) vms_fw_rule ──► vms_security_group
vms_host (1) ──► (N) vms_security_group · vms_sdn · vms_pool
vms_guest (1) ──► (N) vms_replication ──► vms_host (source/target)
vms_guest (1) ──► (N) vms_passthrough
```

> `vms_task` = telemetry operasional (retensi sedang); `vms_snapshot` metadata
> ikut siklus snapshot di hypervisor. `vms_host`/`vms_guest`/`vms_finding`
> persisten.

## 6. Backend (osc_rest) & Agen

Struktur: `osc_rest/skeleton/vms/` (`vms_handler.go`, `vms_usecase.go`,
`vms_repository.go`, `vms_template.go`) + `mechanic/hypervisor/` (driver) +
agen **`osc_auto/agent_vm`** (capability `vmhost`).

### 6.1 Endpoint UI (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("VMS", level)`)

| Area | Endpoint |
|---|---|
| Host | `GET/POST /rest/pages/VMS/hosts`, `GET/PUT/DELETE /VMS/hosts/:id`, `POST /VMS/hosts/:id/ping`, `POST /VMS/hosts/:id/sync` |
| Guest | `GET/POST /VMS/guests`, `GET/PUT/DELETE /VMS/guests/:id` |
| Power | `POST /VMS/guests/:id/start\|stop\|reboot\|suspend\|resume` |
| Snapshot | `GET/POST /VMS/guests/:id/snapshots`, `DELETE /VMS/snapshots/:id`, `POST /VMS/snapshots/:id/restore` |
| Create VM | `POST /VMS/guests` (source **ISO/template** + **cloud-init**) |
| Clone | `POST /VMS/guests/:id/clone` |
| Resize | `PUT /VMS/guests/:id/resources` (vcpu/mem/disk) |
| NIC/jaringan | `GET/POST /VMS/guests/:id/nics`, `PUT/DELETE /VMS/nics/:id` |
| Storage pool | `GET/POST /VMS/hosts/:id/storages`, `PUT/DELETE /VMS/storages/:id` |
| ISO library | `GET/POST /VMS/hosts/:id/isos`, `DELETE /VMS/isos/:id` |
| Backup/restore | `GET/POST /VMS/guests/:id/backups`, `POST /VMS/backups/:id/restore`, `DELETE /VMS/backups/:id` |
| Console | `GET /VMS/guests/:id/console` (WebSocket noVNC; `?type=vnc\|spice`) |
| Template | `GET/POST /VMS/templates`, `PUT/DELETE /VMS/templates/:id` |
| Migrate | _(non-goal — tidak disediakan)_ |
| Firewall | `GET/POST /VMS/guests/:id/firewall`, `PUT/DELETE /VMS/firewall/:id`, `GET/POST /VMS/security-groups`, `PUT/DELETE /VMS/security-groups/:id` |
| SDN | `GET/POST /VMS/hosts/:id/vnets`, `PUT/DELETE /VMS/vnets/:id`, `GET/POST /VMS/sdn/zones` |
| Resource pool | `GET/POST /VMS/pools`, `PUT/DELETE /VMS/pools/:id` |
| Cluster | `GET/POST /VMS/clusters`, `GET/POST /VMS/clusters/:id/nodes`, `POST /VMS/clusters/:id/join`, `GET /VMS/clusters/:id/quorum` |
| HA | `GET/PUT /VMS/guests/:id/ha` |
| Replikasi | `GET/POST /VMS/guests/:id/replications`, `PUT/DELETE /VMS/replications/:id`, `POST /VMS/replications/:id/sync` |
| Hotplug | `POST /VMS/guests/:id/hotplug` (disk/NIC/CPU/RAM) |
| Passthrough | `GET/POST /VMS/guests/:id/passthrough`, `DELETE /VMS/passthrough/:id` |
| Disk move | `POST /VMS/guests/:id/disks/:disk/move` (migrasi storage antar pool) |
| Config raw | `GET/PUT /VMS/guests/:id/config/raw` |
| Boot order | `PUT /VMS/guests/:id/boot-order` |
| Guest agent | `POST /VMS/guests/:id/agent/exec`, `POST /VMS/guests/:id/agent/install` |
| Bulk power | `POST /VMS/guests/bulk` (start/stop/reboot/suspend/resume multi-VM) |
| Tasks | `GET /VMS/tasks`, `GET /VMS/tasks/:id` |
| Findings | `GET /VMS/findings`, `POST /VMS/findings/:id/ack\|resolve`, `POST /VMS/findings/import` (dari `SEC`) |
| Metrics | `GET /VMS/hosts/:id/metrics`, `GET /VMS/guests/:id/metrics` (proxy ke OBS) |

### 6.2 Driver hypervisor (di agen `osc_auto/agent_vm`)

- **Abstraction** `hypervisorDriver`: `list`, `status`, `power`, `snapshot`,
  `clone`, `resize`, `console`, **`create`** (ISO/template + cloud-init),
  **`config`** (NIC/cloud-init), **`storage`** (pool/ISO), **`backup`**
  (export/import), **`firewall`** (**MAJOR**: rule/security-group per-VM/CT),
  **`sdn`** (zone/VNet/VXLAN/EVPN), **`pool`** (resource pool),
  **`cluster`** (join/quorum/Corosync), **`ha`** (auto-restart),
  **`replication`** (async), **`hotplug`** (disk/NIC/CPU/RAM),
  **`passthrough`** (PCI/USB), **`moveDisk`** (storage migration),
  **`rawConfig`** (edit mentah), **`agentExec`**/`agentInstall`,
  **`boot`** (urutan boot/startup). (Migrasi live = non-goal.)
- **Firewall** (**MAJOR**): diterjemahkan ke `nft`/`iptables` (libvirt),
  `incus`/`lxc` security, atau `pve-firewall` (Proxmox) sesuai driver; aturan
  tersimpan `vms_fw_rule`/`vms_security_group` + diaudit.
- **SDN/pool/cluster/HA/replikasi**: driver memetakan ke API hypervisor; jika
  hypervisor tidak mendukung, capability dilaporkan **tidak tersedia** (UI
  menyembunyikan aksi).
- **Incus/LXD dulu**: CLI (`incus`/`lxc`) atau **REST API** lokal; remote via agent.
- **Menyusul**: libvirt/KVM (`virsh`/libvirt API), Proxmox VE (API), VMware
  (vSphere API/`govmomi`), Hyper-V (PowerShell/WinRM).
- **Console** noVNC: agen ambil VNC dari hypervisor, proxy WS ke browser;
  **SPICE** opsional (fase lanjut) lewat proxy serupa.

### 6.3 Endpoint agen (`/rest/agent`, `USBots()`, token `bot_agent` + mTLS)

| Endpoint agen | Fungsi |
|---|---|
| `POST /rest/agent/vms/sync` | Kirim inventaris host/guest (host, guest, status, kapasitas). |
| `POST /rest/agent/vms/action` | Eksekusi aksi terstruktur (power/snapshot/clone/resize/**hotplug/passthrough/raw config/boot/bulk/move disk**) dengan token. |
| `POST /rest/agent/vms/firewall` | Terapkan aturan firewall/security-group ke guest. |
| `POST /rest/agent/vms/cluster` | Operasi cluster (join/quorum/HA/replikasi) pada hypervisor. |
| `POST /rest/agent/vms/exec` | Jalankan perintah di guest via guest agent (QEMU/LXD) / pasang agen. |
| `GET  /rest/agent/vms/ws` | Kanal perintah + stream status tugas. |
| `GET  /rest/agent/vms/console` (WS) | Proxy console (VNC) guest. |
| `GET  /rest/agent/vms/metrics` | Metrik host/guest (dipakai bersama `OBS` `vmhost`). |

> Semua lewat grup `/rest/agent` (`USBots()`); agen **tidak** mengakses DB.

## 7. Frontend (osc_site)

| Kode | Halaman |
|---|---|
| `VMS01` | **Dashboard** — ringkasan host/guest, kapasitas, VM bermasalah + temuan |
| `VMS02` | **Hosts** — daftar hypervisor, tambah/uji/sync, kapasitas |
| `VMS03` | **Host detail** — guest di host itu, resource, temuan |
| `VMS04` | **Guests** — daftar VM + filter host/state + aksi cepat (power) + **power bulk multi-VM** |
| `VMS05` | **Guest detail** — resource, snapshot, **console (noVNC)**, temuan, tasks; tab **Firewall**, **Hotplug**, **Passthrough**, **Config raw**, **Boot order** |
| `VMS06` | **Snapshots** — daftar/restore (lintas guest), opsi RAM/live-state |
| `VMS07` | **Templates** — template/kloning |
| `VMS08` | **Findings** — temuan keamanan (impor dari `SEC`) |
| `VMS09` | **Tasks/Activity** — riwayat aksi (`vms_task`) |
| `VMS10` | **Create VM** — wizard buat VM (source ISO/template, cloud-init, NIC, storage) |
| `VMS11` | **Storage & ISO** — storage pool + ISO/image library per host + **pindah disk antar pool** |
| `VMS12` | **Backups** — backup/restore VM (`vms_backup`), retensi/verifikasi/enkripsi |
| `VMS13` | **Firewall & security groups** — aturan per-VM/CT + security group (MAJOR) |
| `VMS14` | **Cluster & HA** — node/quorum/Corosync, HA manager, replikasi async |
| `VMS15` | **SDN & resource pool** — zone/VNet/VXLAN/EVPN + resource pool |

**Reuse:** `@/uix/datatable`, `@/lib/grid`, `/proxy/pages/*`, pola tab
(`APP02`/`APP04`), **noVNC** (aset baru), `recharts` (grafik via OBS),
`src/lib/ws.ts` (`useSocket`).

## 8. Keamanan & RBAC

- **Kredensial hypervisor** disimpan terenkripsi (`secret_enc`), tidak
  dikembalikan mentah.
- **Least privilege API user** hypervisor; batasi ke IP agen.
- **Aksi destruktif** (hapus/restore/migrate) → konfirmasi + audit; opsi approval
  (`APP04`/`BOOK`).
- **Console** = akses setara shell VM → `USRole("VMS","POST")` + audit; batasi
  rekaman/embed (opsional `vms_task`).
- **Isolasi tenant:** semua query difilter `company_id`.
- **Firewall (MAJOR) & raw config:** perubahan aturan/konfigurasi mentah =
  risiko; wajib validasi + audit + RBAC ketat (dapat mengunci akses guest).
- **Passthrough & hotplug:** perangkat fisik/pindah daya → audit + konfirmasi.
- **Agen relay:** token `bot_agent` + mTLS; agen tidak akses DB.

### 8.1 Otorisasi
- Baca: `VIEW`; power/snapshot/clone/console: `POST`; hapus/migrate: approval.
- **Firewall/SDN/pool/raw config:** `POST` + audit; **passthrough/hotplug/HA/
  replikasi** (mengubah perangkat/ketersediaan) → opsi approval.
- **Bulk power:** izin per-guest divalidasi; `vms_task` mencatat tiap target.

## 9. Retensi & Audit

- `vms_task` → purge via `retention.go` (mis. 180 hari, `RE_DAYS_VMS_TASK`).
- `vms_finding` → persisten (audit keamanan).
- Inventaris (`vms_host`/`vms_guest`) & snapshot metadata → persisten; snapshot
  fisik dikelola hypervisor.
- Semua mutasi UI → `USLogs` (`app_user_action`).

## 10. Integrasi Lintas-Modul

- **OBS** ([app_obs.md](app_obs.md)) — metrik host/guest (`obs_vmhost`/`obs_vm`/
  `obs_vm_stat`); bagian metrik menyatu.
- **SEC** ([app_sec.md](app_sec.md)) — temuan host/VM (`sec_vuln`,
  `sec_sca_result`) diimpor ke `vms_finding`; pelanggaran aturan firewall dapat
  ditautkan sebagai temuan.
- **NET** ([app_net.md](app_net.md)) — IP VM dalam topologi jaringan; **SDN**
  (zone/VNet/VXLAN/EVPN) dapat didelegasikan ke `NET` (lihat §3).
- **POD** ([app_pod.md](app_pod.md)) — container di VM (opsional korelasi).
- **JMS** — penjadwalan snapshot/backup VM, **replikasi**, & sinkronisasi
  inventaris.
- **BOT** — registrasi/heartbeat agen (`bot_agent`).

## 11. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Model & sync** | Perluas `vms_host`/`vms_guest` + `vms_task` + migrasi; capability `vmhost` di agen; sync inventaris (read); halaman `VMS01`–`VMS04`. |
| **B. Power & tasks** | Aksi power (start/stop/reboot/suspend/resume) via agen; `vms_task` + audit; halaman `VMS09`. |
| **C. Snapshot** | `vms_snapshot` + buat/restore/hapus; halaman `VMS06`. |
| **D. Console** | noVNC + proxy WS dari agen; halaman guest detail (`VMS05`). |
| **E. Clone/template/resize** | `vms_template`; clone & resize; halaman `VMS07`. |
| **F. Temuan & polish** | `vms_finding` + impor dari `SEC`; halaman `VMS08`; metrik OBS; hypervisor lain (libvirt/Proxmox/VMware). |
| **F2. Provisioning & penyimpanan** | **Create VM** (ISO/template) + **cloud-init**, **NIC/bridge/VLAN** (`vms_nic`), **storage pool** & **ISO library** (`vms_storage`/`vms_iso`), **backup/restore VM** (`vms_backup`, jadwal `JMS`); halaman `VMS10`–`VMS12`. |
| **G. Firewall & security group (MAJOR)** | Model `vms_fw_rule`/`vms_security_group` + operasi driver `firewall` + endpoint/agen; halaman `VMS13`; tab firewall di `VMS05`. |
| **H. Cluster, HA & replikasi** | `vms_cluster`/`vms_node` (join/quorum/Corosync), `vms_ha`, `vms_replication` (async); halaman `VMS14`. |
| **I. SDN & resource pool** | `vms_sdn` (zone/VNet/VXLAN/EVPN, atau delegasi `NET`) + `vms_pool`; halaman `VMS15`. |
| **J. Hotplug, passthrough & operasi lanjutan** | Hotplug disk/NIC/CPU/RAM, PCI/USB (`vms_passthrough`), **raw config**, **boot order**, **guest agent exec/install**, **disk move**, **bulk power**; perbaikan backup (retensi/verifikasi/enkripsi) & snapshot RAM/live-state; tab di `VMS05`/`VMS11`/`VMS12`. |

## 12. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Aksi destruktif (hapus/restore) | Konfirmasi + audit + opsi approval. |
| Console disalahgunakan | RBAC `POST`, audit, batasi sesi. |
| Lockout hypervisor | Least privilege + uji koneksi + timeout. |
| Perbedaan API hypervisor | Abstraction driver + uji per hypervisor. |
| Snapshot menumpuk | Batasi jumlah/umur + pengingat. |
| Firewall mengunci akses guest (**MAJOR**) | Uji aturan + rollback/undo + audit; peringatan sebelum apply. |
| Raw config merusak guest | Validasi + diff + konfirmasi; simpan versi sebelumnya. |
| Passthrough device bentrok | Cek ketersediaan + audit; larang saat VM hidup jika tak kompatibel. |
| Replikasi divergen/split-brain | Status sync + verifikasi; interval konservatif. |
| HA flapping | Batas `max_restart` + `restart_delay_sec`. |
| Kredensial bocor | Enkripsi `secret_enc`, tidak kembalikan mentah, batasi IP. |

## 13. Non-Goals

- **Migrasi live = non-goal** (keputusan); cukup snapshot + clone.
- **Replikasi async in-scope** (`vms_replication`) tetapi **bukan** migrasi live —
  hanya salinan storage/node berkala.
- ~~Backup VM penuh~~ → **kini in-scope** (`vms_backup`, ekspor/impor + jadwal `JMS`).
- **SPICE client penuh = non-goal fase awal**; **noVNC default**, SPICE opsional
  eksperimental (lihat §3/§14).
- **Fabrik SDN penuh/EVPN controller** → delegasi ke `NET` atau fase lanjut
  (bukan pengganti controller jaringan).
- **Firewall VMS** bukan IDS/IPS — deteksi/analitik tetap di `SEC`/`OBS`.
- Penggantian penuh vCenter/Proxmox UI — OmniSight = konsol agregasi.
- Hypervisor eksotis (mainframe, dll.) — di luar cakupan.

## 14. Keputusan

### 14.1 Terkonfirmasi
- [x] Modul **`VMS`** diperluas dari inventaris menjadi **manajemen VM**.
- [x] Akses hypervisor **via agen** `osc_auto/agent_vm` (capability `vmhost`).

### 14.2 Terkonfirmasi lanjutan
- [x] Hypervisor prioritas: **Incus/LXD dulu** (selaras OBS); lainnya menyusul.
- [x] **Console noVNC** termasuk **fase awal**.
- [x] **Migrasi live = non-goal** (cukup snapshot + clone).
- [x] Snapshot/backup VM & sync inventaris terjadwal via **`JMS`**.
- [x] **Provisioning**: **create VM** dari ISO/template + **cloud-init**.
- [x] **Jaringan guest**: NIC/bridge/VLAN (`vms_nic`).
- [x] **Penyimpanan**: **storage pool** + **ISO/image library** (`vms_storage`/`vms_iso`).
- [x] **Backup/restore VM penuh** (`vms_backup`) — bukan lagi menyusul.
- [x] **Firewall per-VM/CT + security group** (**MAJOR**; `vms_fw_rule`/
  `vms_security_group`) via operasi driver `firewall`.
- [x] **Cluster/quorum/Corosync** (`vms_cluster`/`vms_node`) + **HA manager**
  (`vms_ha`) + **replikasi async** (`vms_replication`, bukan migrasi live).
- [x] **Resource pool** (`vms_pool`) & **SDN** (`vms_sdn`; atau delegasi `NET`).
- [x] **Hotplug** (disk/NIC/CPU/RAM), **passthrough PCI/USB** (`vms_passthrough`),
  **raw config**, **boot order**, **bulk power**.
- [x] **Guest agent exec/install** & **disk move** (migrasi storage antar pool).
- [x] **Backup** retensi/verifikasi/enkripsi & **snapshot RAM/live-state**.

### 14.3 Perlu konfirmasi
- [ ] Approval aksi destruktif (hapus/restore) via **`APP04`/`BOOK`**?
- [ ] **SPICE** dirilis sebagai opsi atau cukup non-goal fase awal (noVNC default)?
- [ ] **SDN**: implementasi driver penuh atau **delegasi ke `NET`**?
- [ ] Approval khusus untuk **firewall/passthrough/HA/replikasi**? (`APP04`).

## 15. Referensi Internal (aset yang bisa dipakai ulang)

- WebSocket proxy pola: `osc_rest/mechanic/sshproxy.go`.
- Route & grup: `osc_rest/backbone/routes.go` (`pages`, `admin`, `agent`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Retensi: `osc_rest/backbone/retention.go`.
- Agen per-VM: **`osc_auto/agent_vm`** (capability `vmhost`; backend = penghubung DB).
- Metrik VM: model `obs_vmhost`/`obs_vm`/`obs_vm_stat` (OBS).
- Konvensi cluster DB: `osc_base/prisma/schema/cluster_vms.prisma`,
  [database/cluster_vms.md](../database/cluster_vms.md).
- Referensi eksternal: Incus/LXD, Proxmox VE, libvirt/KVM, VMware vSphere.
