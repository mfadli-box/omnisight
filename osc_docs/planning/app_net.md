# Planning `NET` — Network Monitoring & Device Management (MikroTik/RouterOS)

> Rencana modul **`NET`**: inventaris & pemantauan jaringan (**SNMP** ala
> LibreNMS) **dan** pengelolaan perangkat **MikroTik (RouterOS)** — terutama
> **firewall** (filter/NAT/mangle/raw), address-list, backup/restore, topologi,
> hardening, dan audit perubahan. Bagian dari
> [Planning](README.md) · Lihat juga [blueprint](blueprint.md),
> [roadmap](roadmap.md), [checklist](checklist.md), serta modul terkait
> [OBS](app_obs.md) (metrik) dan `WAF` (perimeter web).

## 1. Tujuan & Lingkup

Modul `NET` mengelola inventaris & konfigurasi perangkat jaringan, dengan
fokus **MikroTik RouterOS**:

- **Inventaris perangkat** — subnet, perangkat, antarmuka, status (`net_device`).
- **Manajemen MikroTik (RouterOS)**:
  - **Firewall `filter`** — input/forward/output (accept/drop/reject/jump/log,
    match src/dst, port, protocol, connection-state, interface, dll.).
  - **NAT** — srcnat/dstnat/masquerade, port-forwarding.
  - **Mangle** & **Raw** — marking/qos & early drop.
  - **Address-list** — allow/block list, entri dinamis.
  - Enable/disable, **ubah urutan (move)**, komentar, bulk/template,
    **time-based rules**, **clone/duplicate** rule, reset counter.
  - **Backup/export & diff/restore** konfigurasi (export `.rsc` + biner `.backup`).
  - **Audit setiap perubahan** (before/after) + rollback.
- **Monitoring** — resource (CPU/mem/uptime), antarmuka (traffic/status),
  hitungan firewall (packets/bytes per rule) — dapat disalurkan ke `OBS`.
- **SNMP monitoring (ala LibreNMS)** — poll **SNMP v2c/v3** untuk health &
  **trafik per interface** (time-series `net_interface_stat`) pada **MikroTik
  maupun perangkat jaringan lain**; ambang batas & alert via `OBS`.
- **Health & optik (SNMP)** — sensor **suhu/tegangan/fan/PSU** (`net_sensor`),
  **SFP DDM/DOM** (optical Rx/Tx power & suhu), dan **status PoE** per port.
- **Discovery SNMP/subnet** — sapuan subnet + probe SNMP untuk menemukan
  kandidat perangkat (reuse `net_discovery`, kini **aktif untuk SNMP/ARP**).
- **Rollup jangka panjang** — agregasi `net_interface_stat` (jam/hari) agar tren
  retensi panjang (ala RRD LibreNMS) tanpa menyimpan raw selamanya.
- **Trap & syslog receiver** — terima **SNMP trap** & **syslog** perangkat
  (terpusat), parse + korelasi + alert.
- **Topologi L2** — tautan **LLDP/CDP** + tabel **FDB/MAC** (peta jaringan).
- **Config backup terjadwal** — snapshot berkala + diff (ala Oxidized), via `JMS`.
- **Hardening** (Fase lanjutan yang **disetujui**) — kelola `/user`+group,
  `/ip/service`, SSH keys, dan remote **syslog** (`/system/logging`).
- **Alerting & rule engine (NET-side)** — konfigurasi ambang/rule **di sisi NET**
  (match/recovery/mute/**invert**) untuk **interface, sensor, syslog**; event
  `net_*` dialirkan ke **transport `OBS`** (§6.4 pemetaan) — melengkapi, bukan
  menggantikan, alert `OBS`.
- **Ambang batas per-sensor & per-port** — kolom batas yang dapat dikonfigurasi
  (`warn`/`low`/`low_warn`) pada `net_sensor` & statistik interface + wiring alert.
- **Grup perangkat & grup port** — pengelompokan **dinamis** (vendor,
  `ros_version`, subnet, **tag**) untuk operasi **fleet/bulk** & apply template;
  **grup port** untuk bulk rule/template & alert utilisasi.
- **Billing/kuota bandwidth (95th percentile)** — tampilan billing/kuota berbasis
  `net_interface_stat_rollup` (puncak 95th, kuota, pemakaian).
- **Availability/SLA + RTT/loss + alasan down** — riwayat ping (RTT/loss),
  ketersediaan/SLA, dan **alasan device down** (ICMP vs SNMP) — melampaui endpoint
  ping tunggal saat ini.
- **Riwayat time-series sensor/optik/PoE** — reuse pola **rollup** (kini hanya
  state/retensi pendek).
- **VLAN discovery/collection** — bridge/interface VLAN + **keanggotaan VLAN per
  port** (kini hanya `net_subnet.vlan`).
- **IP address table** — koleksi IP interface/subnet VLAN (independen dari
  read-only DHCP-lease/ARP yang ditangguhkan).
- **Inventaris hardware (ENTITY-MIB `entPhysical`)** — cage/SFP/PSU/fan di luar
  field model/serial/board saat ini.
- **Metadata interface** — `ifAlias`/deskripsi, admin status, duplex, MTU.
- **Alerting dari syslog/trap + de-dup/rate correlation** — `net_syslog_event`
  (kini hanya disimpan) dipakai untuk trigger/agregasi alert.
- **Maintenance window / suppression alert** — terikat jadwal change/backup.
- **Kelas sensor tambahan** — **CURRENT** (dan humidity dsb. bila board
  mendukung) di luar TEMPERATURE/VOLTAGE/FAN/PSU/POWER.
- **Pencarian config + version index/gaya git** — di luar backup+diff.
- **Custom MIB / pemetaan OID** — MIB kesehatan board-spesifik.
- **API token read-only scoped** — untuk konsumen eksternal.

### 1.1 Ditangguhkan (non-goal fase awal)

Berdasarkan keputusan terakhir, fitur berikut **ditangguhkan** (dapat ditinjau
ulang di fase mendatang):

- **VPN MikroTik** (WireGuard/IPsec/PPPoE server).
- **Auto-block / threat feed** (fail2ban-like + feed Spamhaus dll.).
- **Discovery MNDP/RoMON** (proprietary MikroTik) — **catatan:** discovery **L2
  lewat SNMP (LLDP/CDP/FDB)** + **sapuan subnet/probe SNMP** (reuse
  `net_discovery`) tetap **in-scope** (§1).
- **Scripts & scheduler** RouterOS (`/system/script`, `/system/scheduler`) —
  kecuali **time-based rules** pada firewall (tetap in-scope).
- **Live traffic** (torch) dan view read-only DHCP leases/ARP/DNS.

Keputusan lingkup: modul **`NET`** dan cluster **`net_*`** (manajemen MikroTik
digabung ke NET; tidak ada modul baru).

## 2. Referensi Fitur (MikroTik RouterOS)

| Area | Referensi | Target `NET` |
|---|---|---|
| Koneksi | RouterOS API (8728), API-SSL (8729), REST v7 (HTTPS), SSH | ✅ (lihat §6) |
| Firewall filter | `/ip/firewall/filter` | ✅ |
| NAT | `/ip/firewall/nat` | ✅ |
| Mangle/Raw | `/ip/firewall/mangle`, `/ip/firewall/raw` | ✅ |
| Address-list | `/ip/firewall/address-list` | ✅ |
| Connection tracking | `/ip/firewall/connection` | ✅ (read) |
| IPv6 firewall | `/ipv6/firewall/*` | ⚠️ bertahap |
| Log & counters | `/log`, rule counters, syslog | ✅ |
| L2 topology (LLDP/CDP/FDB) | LLDP-MIB, CDP, `dot1dTpFdbTable` | ✅ |
| Scripts & scheduler | `/system/script`, `/system/scheduler` | ⏸️ ditangguhkan |
| Users & groups | `/user`, `/user/group` | ✅ (hardening) |
| IP services / hardening | `/ip/service` | ✅ (hardening) |
| SNMP polling (health/trafik) | `/snmp` (v2c/v3) + MIB | ✅ |
| SNMP health sensors (temp/volt/fan/PSU) | ENTITY-SENSOR-MIB, vendor MIB | ✅ |
| SNMP optik (SFP DDM/DOM) | ENTITY-SENSOR/IF-MIB ext (`ifXTable`) | ✅ |
| PoE status per port | POWER-ETHERNET-MIB | ✅ |
| SNMP trap / syslog receiver | trap → receiver, `/system/logging` remote | ✅ |
| Remote logging (keluar) | `/system/logging` | ✅ (hardening) |
| Backup biner | `/system/backup` | ✅ |
| DHCP leases / ARP / DNS (read) | `/ip/dhcp-server/lease`, `/ip/arp`, `/ip/dns` | ⏸️ ditangguhkan |
| Auto-block / threat feed | address-list + parsing log | ⏸️ ditangguhkan |
| Discovery (MNDP/RoMON) | MNDP / RoMON | ⏸️ ditangguhkan |
| Discovery (SNMP/subnet) | SNMP, LLDP/CDP, ARP/FDB | ✅ (topologi) |
| Alert rules & transport | LibreNMS alert rules (match/recovery/mute/**invert**) → `OBS` | ✅ (baru) |
| Ambang per-sensor/per-port | sensor & port threshold (`warn`/`low`/`low_warn`) | ✅ (baru) |
| Device/port groups | dynamic groups (vendor/`ros_version`/subnet/tag) | ✅ (baru) |
| Billing/95th percentile | bandwidth billing & quota | ✅ (baru) |
| Availability/SLA + RTT/loss | availability, ping, down reason (ICMP/SNMP) | ✅ (baru) |
| Sensor/optik/PoE history | sensor history rollup | ✅ (baru) |
| VLAN collection | Q-BRIDGE-MIB / bridge VLAN | ✅ (baru) |
| IP address table | IP-MIB `ipAddrTable` | ✅ (baru) |
| Hardware inventory | ENTITY-MIB `entPhysical` | ✅ (baru) |
| Interface metadata | IF-MIB `ifAlias`/`ifAdminStatus`/MTU/duplex | ✅ (baru) |
| Syslog/trap alerting | eventlog → alert + de-dup | ✅ (baru) |
| Maintenance/suppression | maintenance windows | ✅ (baru) |
| Sensor classes (CURRENT/humidity) | ENTITY-SENSOR-MIB classes | ✅ (baru) |
| Config search/version index | Oxidized-style history/search | ✅ (baru) |
| Custom MIB/OID | custom OID mapping | ✅ (baru) |
| API token read-only | scoped read-only tokens | ✅ (baru) |
| Live traffic (torch) | `/tool/torch` | ⏸️ ditangguhkan |
| VPN (WireGuard/IPsec/PPPoE) | `/interface/wireguard`, `/ip/ipsec` | ⏸️ non-goal |

**Referensi alat**: WinBox/WebFig (GUI resmi), RouterOS API/REST.

## 3. Keputusan Arsitektur ✅ (terkonfirmasi)

1. **Kode modul:** `NET` (MikroTik digabung ke NET) — halaman `NET01`..`NET0N`.
2. **Cluster DB:** `net_*` (file `cluster_net.prisma` + `cluster_net.md`).
3. **Protokol:** **keduanya** — **RouterOS API** (binary v6 & v7, API/API-SSL)
   **dan REST v7** (HTTPS); dipilih per perangkat via `net_device.api_mode`.
4. **Koneksi:** **selalu via agen `osc_auto/agent_vm`** — backend **tidak**
   menyambung langsung ke perangkat; agen jembatan jaringan, backend tetap
   satu-satunya penghubung DB.
5. **Perubahan aman:** **ya** — snapshot (`/export`) + **dry-run** + **rollback
   otomatis** untuk setiap perubahan berisiko; lindungi akses (safe-mode/protect
   input).
6. **Alerting:** rule engine ringan **di NET** (threshold/match/recovery/mute/
   invert) untuk device/interface/sensor/syslog; **transport & kanal tetap di
   `OBS`** — event `net_*` dipetakan ke `obs_alert_rule`/`obs_notification` (§6.4).
7. **Grup & bulk:** grup perangkat/port **dinamis** (vendor/`ros_version`/subnet/
   tag) sebagai basis fleet/bulk & apply template; **tanpa** anggota statis.
8. **Token:** **API token read-only scoped** untuk konsumen eksternal (§8).
9. **Koleksi SNMP diperluas:** VLAN, IP address table, `entPhysical`, metadata
   interface, riwayat sensor/optik/PoE — tetap **SNMP**, **via agen**.

## 4. Arsitektur & Topologi

```
Browser ──► osc_site (:37773) ──/proxy/pages/NET/*──► osc_rest (:37772)
                                                        │  orkestrasi + validasi
                                                        └── /rest/agent ──► agent_vm (osc_auto)
                                                                                 ├── RouterOS API-SSL (:8729) ──► MikroTik
                                                                                 └── RouterOS REST v7 (HTTPS) ──► MikroTik
osc_rest ──pgx──► PostgreSQL (net_*)
```

- **Backend = penghubung tunggal ke DB**; agen `osc_auto/agent_vm` = jalur
  **wajib** ke perangkat (relay eksekusi klien RouterOS), **tidak** akses DB.
- **Kedua protokol** (API biner & REST v7) dijalankan **di agen**; backend hanya
  mengirim perintah & menerima hasil.
- Kredensial perangkat disimpan terenkripsi (`secret_enc`); perangkat diikat ke
  agen pengelolanya (`net_device.agent_id`).

## 5. Model Database — cluster `net_*`

### 5.1 Sudah ada

| Model | Isi |
|---|---|
| `net_subnet` | Subnet/CIDR, gateway, vlan. |
| `net_device` | Perangkat: `device_type`, `vendor`, `model`, `ip_address`, `status`, `last_seen`. |
| `net_interface` | Antarmuka: `if_index`, `mac_address`, `ip_address`, `speed_mbps`, `status`, `if_type`?, `poe_out`?. |

### 5.2 Baru (manajemen MikroTik)

| Model | Isi pokok | Kunci |
|---|---|---|
| `net_device` (perluas) | Tambah kolom manajemen: `agent_id` (→ `bot_agent`, agen pengelola), `vendor` (MIKROTIK/NETGEAR/…), `ros_version`, `identity`, `board_name`, `serial`, `api_endpoint`, `api_mode` (`API` \| `REST`), `api_port`, `api_tls`, `username`, `secret_enc`, `managed`, `uptime_sec`, `cpu_load_pct`, `mem_free_mb`; **SNMP**: `snmp_version` (V2C/V3/NONE), `snmp_community_enc`, `snmp_v3_user/auth/priv_enc`, `snmp_port`, `snmp_enabled`; **grup**: `tags` (Json, dasar grup dinamis) | `@@unique([company_id, code])`; indeks `agent_id` |
| `net_firewall_rule` | Aturan: `device_id`, `table` (FILTER/NAT/MANGLE/RAW), `chain`, `action`, `position`, `disabled`, `comment`, `params` (Json), `packets` (BigInt), `bytes` (BigInt), `ros_id` | `@@index([device_id, table, chain])` |
| `net_address_list_entry` | Entri address-list: `device_id`, `list`, `address`, `comment`, `dynamic`, `timeout`, `ros_id` | `@@index([device_id, list])` |
| `net_config_backup` | Backup/export: `device_id`, `kind` (EXPORT/BACKUP), `name`, `content` (TEXT), `content_hash`, `ros_version`, `size_bytes`, `created_by` | `@@index([device_id, created_at])` |
| `net_change` | Audit perubahan: `device_id`, `action` (CREATE/UPDATE/DELETE/ENABLE/DISABLE/MOVE/IMPORT), `target_type`, `target_ref`, `before` (Json), `after` (Json), `status`, `message`, `user_id` | indeks `[company_id, created_at]` |
| `net_firewall_event` | Log firewall/koneksi (telemetry): `device_id`, `topic`, `action`, `src`, `dst`, `port`, `message`, `recorded_at` | indeks `[device_id, recorded_at]` |
| `net_interface_stat` | Time-series trafik/status interface (SNMP): `device_id`, `if_index`, `if_name`, `in_octets`, `out_octets`, `in_errors`, `out_errors`, `in_discards`, `out_discards`, `speed_mbps`, `oper_status`, `optical_rx_dbm`?, `optical_tx_dbm`?, `optical_temp_c`? (SFP DDM/DOM), `poe_status`?, `poe_power_mw`?, `recorded_at` | indeks `[device_id, if_index, recorded_at]` |
| `net_interface_stat_rollup` | Agregasi jam/hari trafik interface: `device_id`, `if_index`, `bucket`, `in_octets_avg/max`, `out_octets_avg/max`, `in_errors_sum`, `out_errors_sum`, `count` | `@@unique([device_id, if_index, bucket])` |
| `net_sensor` | Sensor health SNMP: `device_id`, `class` (TEMPERATURE/VOLTAGE/FAN/PSU/POWER/**CURRENT**/**HUMIDITY**), `name`, `index`, `value_num`, `unit`, `status` (OK/WARN/CRIT/UNKNOWN), **ambang**: `warn_high`?, `warn_low`?, `low_warn`?, `collected_at` | `@@unique([device_id, class, index])` |
| `net_syslog_event` | Log terpusat (syslog/trap): `device_id`?, `source_ip`, `severity`, `facility`, `program`, `message`, `kind` (SYSLOG/TRAP), **de-dup/korelasi**: `dedup_key`?, `count`, `first_seen`, `last_seen`, `alert_id`?, `recorded_at` | indeks `[company_id, recorded_at]`; indeks `[company_id, dedup_key, last_seen]` |
| `net_topology_link` | Tautan L2: `device_id`, `local_if`, `remote_device`?, `remote_port`, `protocol` (LLDP/CDP), `direction`, `collected_at` | indeks `[device_id]` |

Relasi inti:

```text
net_subnet (1) ──► (N) net_device ──► (N) net_interface ──► (N) net_interface_stat (telemetry)
                                                    └──► net_interface_stat_rollup ──► (jam/hari)
net_device (1) ──► (N) net_sensor (health SNMP)
                                   ├──► (N) net_firewall_rule
                                   ├──► (N) net_address_list_entry
                                   ├──► (N) net_config_backup
                                   ├──► (N) net_change (audit)
                                   ├──► (N) net_firewall_event (telemetry)
                                   ├──► (N) net_syslog_event (telemetry)
                                   └──► (N) net_topology_link (L2)
```

> `net_firewall_event`/`net_interface_stat`/`net_syslog_event` = telemetry
> beretensi. Data konfigurasi (`net_firewall_rule`, `net_address_list_entry`)
> persisten; `net_config_backup` dibatasi jumlah/umur; `net_topology_link`
> diperbarui tiap polling.

### 5.3 Discovery (aktif) & Tambahan lanjutan ⏸️ (ditangguhkan)

> **Discovery SNMP/subnet** kini **aktif** (bukan lagi ditangguhkan):
> `net_discovery` menyimpan kandidat hasil sapuan subnet + probe SNMP/ARP dan
> di-*adopt* menjadi `net_device`. Model otomasi/intel lain di bawah **belum
> dibangun** — hanya referensi bila fitur ditangguhkan (§1.1) diaktifkan kembali.

| Model | Isi pokok | Kunci |
|---|---|---|
| `net_discovery` | Kandidat hasil discovery **SNMP/subnet/ARP** (MNDP/RoMON tetap ditangguhkan): `address`, `mac`, `identity`, `board`, `ros_version`, `sys_descr`, `adopted` (Bool) | indeks `[company_id, address]` |
| `net_blocklist` | Sumber blokir/intel: `name`, `source` (FEED/AUTO/FAIL2BAN), `list` (target `address-list`), `feed_url`, `rule` (Json kondisi), `ttl_sec`, `is_active` | `@@unique([company_id, name])` |
| `net_block_entry` | Entri hasil blokir: `blocklist_id`, `address`, `reason`, `hits`, `expires_at`, `synced` | indeks `[blocklist_id, address]` |
| `net_script` | Skrip/scheduler RouterOS: `device_id`, `kind` (SCRIPT/SCHEDULER), `name`, `source` (TEXT), `interval`, `on_event`, `is_active`, `ros_id` | indeks `[device_id, kind]` |

```text
net_device (1) ──► (N) net_script
net_blocklist (1) ──► (N) net_block_entry ──(sync)──► net_address_list_entry
net_discovery ──(adopt)──► net_device
```

### 5.4 Baru — kelengkapan kesejajaran LibreNMS (audit)

> Menutup kekurangan audit terhadap LibreNMS: alerting/ambang, grup, billing,
> availability/SLA, riwayat sensor, VLAN/IP, inventaris hardware, metadata,
> dedup syslog, maintenance window, config version, custom MIB, dan token API.
> Semua tetap **SNMP/MikroTik**, **via agen**, dengan **dry-run + rollback** untuk
> perubahan; tanpa VPN/auto-block/MNDP-RoMON/scripts/torch.

| Model | Isi pokok | Kunci |
|---|---|---|
| `net_interface` (perluas) | Metadata & ambang: `if_alias`, `description`, `admin_status`, `duplex`, `mtu`, `vlan_id`?, `th_warn_pct`?, `th_low_pct`? | indeks `[device_id, if_index]` |
| `net_alert_rule` | Rule engine **NET-side**: `name`, `scope` (DEVICE/INTERFACE/SENSOR/SYSLOG), `subject_id`?, `metric`, `comparator` (GT/GTE/LT/LTE/EQ), `threshold`, `duration_sec`, `severity`, `match` (Json), `recovery` (Json), `mute` (Bool)/`muted_until`?, `invert` (Bool), `transport` (Json → `OBS`), `is_active` | `@@unique([company_id, name])` |
| `net_alert` | Event alert NET: `rule_id`, `scope`, `subject_ref`, `severity`, `condition`, `status` (FIRING/ACK/RESOLVED), `value`, `message`, `dedup_key`, `fired_at`, `acked_at`, `resolved_at`, `obs_alert_id`? (taut `OBS`) | indeks `[company_id, status, fired_at]` |
| `net_device_group` | Grup **dinamis**: `name`, `kind` (DEVICE/PORT), `rule` (Json: vendor/`ros_version`/subnet/tag), `is_active` | `@@unique([company_id, name])` |
| `net_billing` | Billing/kuota bandwidth: `name`, `device_id`?/`if_index`?/`group_id`?, `period` (MONTH), `direction` (IN/OUT/MAX), `quota_bytes`?/`quota_pct95_mbps`?, `is_active` | `@@unique([company_id, name])` |
| `net_availability` | SLA/uptime: `device_id`, `bucket`, `period`, `uptime_pct`, `latency_avg_ms`, `loss_pct`, `down_count`, `down_reason` (ICMP/SNMP), `downtime_sec`, `computed_at` | `@@unique([device_id, period, bucket])` |
| `net_ping_result` | Riwayat RTT/loss: `device_id`, `target`, `ok`, `rtt_ms`, `loss_pct`, `method` (ICMP/SNMP), `recorded_at` | indeks `[device_id, recorded_at]` |
| `net_sensor_stat_rollup` | Agregasi jam/hari sensor/optik/PoE: `device_id`, `class`, `index`, `bucket`, `value_avg/min/max`, `optical_rx_avg`?, `optical_tx_avg`?, `poe_power_avg`?, `count` | `@@unique([device_id, class, index, bucket])` |
| `net_vlan` | VLAN terkumpul: `device_id`, `vlan_id`, `name`, `bridge`?, `tagged`/`untagged` (Json port), `status` | `@@unique([device_id, vlan_id])` |
| `net_ip_address` | IP address table: `device_id`, `if_index`?, `address`, `prefix_len`, `type` (IPV4/IPV6), `vrf`?, `vlan_id`? | indeks `[device_id, if_index]` |
| `net_entity_physical` | Inventaris ENTITY-MIB `entPhysical`: `device_id`, `ent_index`, `parent_index`?, `class` (CHASSIS/PSU/FAN/SENSOR/PORT/SFP), `name`, `descr`, `model`, `serial`, `vendor`, `hw_rev`, `fw_rev`, `oper_status`, `collected_at` | `@@unique([device_id, ent_index])` |
| `net_maintenance_window` | Peredam alert: `name`, `scope` (DEVICE/GROUP/INTERFACE), `subject_id`?, `starts_at`, `ends_at`, `recurrence`?, `suppress_alerts` (Bool), `job_id`? (taut change/backup `JMS`), `is_active` | `@@unique([company_id, name])` |
| `net_config_revision` | Index versi config (pencarian/gaya git): `device_id`, `backup_id`?, `commit_ref`, `content_hash`, `ros_version`, `size_bytes`, `content` (TEXT, terindeks full-text/trigram), `indexed_at` | indeks `[device_id, indexed_at]` |
| `net_custom_oid` | Pemetaan OID/MIB custom: `vendor`?/`device_id`?, `oid`, `name`, `class` (SENSOR/TEMP/VOLT/CURRENT/HUMIDITY/…), `unit`, `scale`, `is_active` | `@@unique([company_id, vendor, oid])` |
| `net_api_token` | Token **read-only scoped**: `name`, `token_hash`, `scopes` (Json: devices/interfaces/sensors/availability), `device_ids`?/`group_id`?, `expires_at`, `last_used_at`, `is_active` | `@@unique([company_id, name])` |

```text
net_device (1) ──► (N) net_alert_rule ──► (N) net_alert ──► (obs_alert) ──► obs_notification
net_device (1) ──► (N) net_ping_result · net_availability (SLA)
net_device (1) ──► (N) net_sensor_stat_rollup (sensor/optik/PoE)
net_device (1) ──► (N) net_vlan · net_ip_address · net_entity_physical
net_device (1) ──► (N) net_config_revision ◄── net_config_backup
net_alert_rule ──(mute/suppress)◄── net_maintenance_window ──(job_id)──► JMS
net_device_group ──(rule)──► net_device / net_interface   net_custom_oid ──(poll)──► net_sensor
net_api_token ──(scope)──► /rest/guest + endpoint read-only
```

> `net_alert`/`net_ping_result` = telemetry beretensi; `net_sensor_stat_rollup`/
> `net_availability` disimpan lebih lama; `net_alert_rule`, `net_device_group`,
> `net_billing`, `net_maintenance_window`, `net_custom_oid`, `net_api_token`
> persisten; `net_vlan`/`net_ip_address`/`net_entity_physical` = state terkini.

## 6. Backend (osc_rest) & Klien RouterOS (osc_auto)

Struktur:
- **`osc_rest/skeleton/net/`** — handler/usecase/repository/template (orkestrasi,
  validasi, audit, persistensi `net_*`).
- **`osc_auto/agent_vm/`** — klien RouterOS (**keduanya**: API biner & REST v7)
  yang benar-benar menyambung ke perangkat.

### 6.1 Endpoint (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("NET","POST")`)

| Area | Endpoint |
|---|---|
| Perangkat | `GET/POST /rest/pages/NET/devices`, `GET/PUT/DELETE /NET/devices/:id`, `POST /NET/devices/:id/ping`, `POST /NET/devices/:id/test` |
| Resource | `GET /NET/devices/:id/resource`, `GET /NET/devices/:id/interfaces` |
| SNMP monitor | `GET/PUT /NET/devices/:id/snmp`, `POST /NET/devices/:id/snmp/test`, `GET /NET/devices/:id/interfaces/:ifIndex/stats?range=` |
| Health & optik | `GET /NET/devices/:id/sensors`, `GET /NET/devices/:id/interfaces/:ifIndex/optical` |
| Discovery | `POST /NET/discovery/scan`, `GET /NET/discovery`, `POST /NET/discovery/:id/adopt` |
| Topology | `GET /NET/topology`, `POST /NET/devices/:id/topology/refresh` |
| Syslog/trap | `POST /NET/syslog` (receiver), `POST /NET/trap`, `GET /NET/logs` |
| Backup jadwal | `POST /NET/devices/:id/backups/schedule` (via `JMS`), `GET /NET/devices/:id/backups/diff` |
| Firewall | `GET/POST /NET/devices/:id/firewall/:table`, `PUT/DELETE /NET/firewall-rules/:id`, `POST /NET/firewall/rules/:id/enable\|disable\|move\|clone\|reset-counter` |
| Address list | `GET/POST /NET/devices/:id/address-lists`, `DELETE /NET/address-list-entries/:id` |
| NAT | `GET/POST /NET/devices/:id/nat` (+ aksi) |
| Backup | `GET/POST /NET/devices/:id/backups`, `GET /NET/backups/:id`, `POST /NET/backups/:id/restore`, `GET /NET/devices/:id/diff` |
| Log/event | `GET /NET/devices/:id/events` (SSE) |
| Change log | `GET /NET/changes` (read-only) |
| Sync | `POST /NET/devices/:id/sync` (tarik konfigurasi → `net_firewall_rule` dll.) |
| Users & services | `GET/PUT /NET/devices/:id/users`, `GET/PUT /NET/devices/:id/services` (hardening) |
| Syslog | `GET/PUT /NET/devices/:id/logging` (remote syslog, hardening) |
| Backup biner | `GET/POST /NET/devices/:id/backups?kind=BACKUP` (`.backup`) + restore terkonfirmasi |
| Alert rules | `GET/POST /NET/alert-rules`, `GET/PUT/DELETE /NET/alert-rules/:id`, `POST /NET/alert-rules/:id/test`, `GET /NET/alerts`, `POST /NET/alerts/:id/ack\|resolve` |
| Threshold | `GET/PUT /NET/devices/:id/interfaces/:ifIndex/thresholds`, `GET/PUT /NET/sensors/:id/thresholds` |
| Grup | `GET/POST /NET/groups`, `PUT/DELETE /NET/groups/:id`, `GET /NET/groups/:id/members`, `POST /NET/groups/:id/apply` |
| Billing | `GET /NET/billing`, `GET/POST /NET/billing-rules`, `PUT/DELETE /NET/billing-rules/:id`, `GET /NET/billing/:id/report?percentile=95` |
| Availability/SLA | `GET /NET/sla`, `GET /NET/devices/:id/availability?range=`, `GET /NET/devices/:id/ping?range=` |
| Riwayat sensor | `GET /NET/devices/:id/sensors/:index/history?range=`, `GET /NET/devices/:id/interfaces/:ifIndex/optical/history` |
| VLAN & IP | `GET /NET/devices/:id/vlans`, `GET /NET/devices/:id/ip-addresses` |
| Inventaris | `GET /NET/devices/:id/inventory` (ENTITY-MIB `entPhysical`) |
| Config search | `GET /NET/config/search?q=`, `GET /NET/devices/:id/config/revisions` |
| Custom OID | `GET/POST /NET/custom-oids`, `PUT/DELETE /NET/custom-oids/:id` |
| Maintenance | `GET/POST /NET/maintenance`, `PUT/DELETE /NET/maintenance/:id` |
| API token | `GET/POST /NET/api-tokens`, `PUT/DELETE /NET/api-tokens/:id`, `POST /NET/api-tokens/:id/revoke` |

> ⏸️ Endpoint discovery, blocklist/intel, scripts/scheduler, torch, dan read-only
> leases/ARP/DNS ditangguhkan (§1.1).

### 6.2 Klien RouterOS (di agen `osc_auto/agent_vm`)
- **Transport — keduanya** (dipilih per perangkat via `net_device.api_mode`):
  - **RouterOS API (biner)** — port 8728 (API) / 8729 (API-SSL), via library Go
    ringan (mis. `github.com/go-routeros/routeros`); mendukung RouterOS v6 & v7.
  - **REST v7** — HTTPS, JSON (router yang ber-ROS v7).
- **SNMP collector** — poll **v2c/v3** (mis. `github.com/gosnmp/gosnmp`) untuk
  health & `ifTable`/`ifXTable` (trafik/error/discard per interface), **sensor
  health** (ENTITY-SENSOR-MIB: suhu/tegangan/fan/PSU), **optik SFP DDM/DOM**,
  dan **PoE** (POWER-ETHERNET-MIB); berlaku untuk MikroTik **dan** perangkat lain.
- **Trap/syslog receiver** — agen menerima **SNMP trap** & **syslog** dari
  perangkat (UDP), parse, teruskan batch ke backend (`net_syslog_event`).
- **L2 discovery** — ambil **LLDP/CDP** + **FDB/MAC** via SNMP untuk topologi.
- **Peran backend vs agen:** backend **tidak** menyambung ke perangkat; backend
  mengirim perintah ke agen via grup `/rest/agent`, agen mengeksekusi dan
  mengembalikan hasil. Semua koneksi keluar-masuk lewat agen.
- Timeout, retry, rate-limit; pooling koneksi per perangkat di agen.

### 6.2.1 Endpoint agen (`/rest/agent`, `USBots()`, token `bot_agent` + mTLS)
| Endpoint agen | Fungsi |
|---|---|
| `POST /rest/agent/net/test` | Uji koneksi perangkat (pilih API/REST). |
| `POST /rest/agent/net/exec` | Eksekusi perintah `/ip/firewall/*` dll. (payload terstruktur). |
| `POST /rest/agent/net/sync` | Agen kirim konfigurasi (firewall/address-list/resource) ke backend → `net_*`. |
| `POST /rest/agent/net/snmp` | Poll SNMP (health + trafik/error per interface + sensor + optik + PoE) → `net_interface_stat`/`net_sensor`. |
| `POST /rest/agent/net/discovery` | Sapuan subnet + probe SNMP/ARP kandidat perangkat → `net_discovery`. |
| `POST /rest/agent/net/topology` | Kirim hasil LLDP/CDP/FDB (topologi L2) → `net_topology_link`. |
| `POST /rest/agent/net/syslog` | Teruskan syslog/trap perangkat → `net_syslog_event`. |
| `POST /rest/agent/net/harden` | Terapkan hardening (`/user`, `/ip/service`, `/system/logging`) sesuai permintaan backend. |
| `POST /rest/agent/net/collect` | Koleksi SNMP diperluas: VLAN, IP address table, `entPhysical`, metadata interface, riwayat sensor/optik/PoE → `net_*`. |
| `POST /rest/agent/net/availability` | Probe ICMP/SNMP RTT/loss + alasan down → `net_ping_result`/`net_availability`. |
| `POST /rest/agent/net/config-pull` | Ambil config untuk index/pencarian versi → `net_config_revision`. |
| `POST /rest/agent/net/custom-oid` | Poll OID custom (pemetaan `net_custom_oid`) → `net_sensor`. |
| `GET /rest/agent/net/events` (SSE) | Stream log/event firewall dari agen. |

> Semua endpoint agen memakai grup `/rest/agent` (`USBots()`), token `bot_agent`
> + mTLS; agen **tidak** mengakses DB.

### 6.3 Operasi aman (safe apply) — dry-run + rollback otomatis ✅
- **Snapshot** (`/export`) sebelum perubahan → simpan `net_config_backup`.
- **Dry-run**: validasi parameter; tampilkan diff sebelum commit.
- **Rollback otomatis**: bila apply gagal / verifikasi (koneksi & aturan) gagal,
  pulihkan dari snapshot tanpa intervensi.
- **Anti-lockout**: peringatan bila mengubah chain `input`; opsi safe-mode.
- Semua perubahan → `net_change` + `USLogs`.

### 6.4 Pemetaan event `net_*` → transport `OBS`
Rule engine **NET-side** mengevaluasi ambang (match/recovery/mute/invert) lalu
**merutekan** event ke transport & kanal yang **tetap milik `OBS`** (`obs_alert_rule`
+ `obs_notification`; dispatcher `APP06`/`app_sys.md` bila memakai notifikasi
internal).

| Sumber `net_*` | Event | Pemetaan ke `OBS` |
|---|---|---|
| `net_device` | DOWN/UP (ICMP/SNMP) | `obs_alert_rule` scope `DEVICE`, metric `status` |
| `net_interface`/`net_interface_stat` | utilisasi/error/discard, oper status | scope `INTERFACE`, metric `if_util`/`if_errors` |
| `net_sensor` (+custom OID) | suhu/volt/fan/PSU/POWER/CURRENT/humidity | scope `DEVICE`, metric `net_sensor_*` |
| `net_syslog_event` | SYSLOG/TRAP (setelah de-dup) | rule event-based → `obs_alert` |
| `net_availability` | pelanggaran SLA/RTT/loss | scope `DEVICE`, metric `availability` |

> Output akhir: `net_alert` (NET) → `obs_alert` (FIRING/ACK/RESOLVED) → kirim via
> `obs_notification` (email/webhook/ntfy/Telegram/Slack/Discord). Token & kanal
> tidak diduplikasi di NET.

## 7. Frontend (osc_site)

| Kode | Halaman |
|---|---|
| `NET01` | **Overview/Topologi** — ringkasan perangkat & status |
| `NET02` | **Devices** — inventaris + tambah/uji koneksi |
| `NET03` | **Device detail** — resource (CPU/mem/uptime), interfaces + **metadata** (`ifAlias`/admin/duplex/MTU) + **grafik trafik SNMP** (time-series) + **optik SFP**, **sensor health** (suhu/volt/fan/PSU/CURRENT/humidity) + **PoE** (+ riwayat), identitas, SNMP config, **inventory `entPhysical`** |
| `NET04` | **Firewall** — tab Filter/NAT/Mangle/Raw; tabel aturan, enable/disable, **reorder**, clone/reset-counter, editor + diff, kolom packets/bytes |
| `NET05` | **Address-lists** — allow/block list |
| `NET06` | **Backups & diff** — snapshot export (`.rsc`) & biner (`.backup`), banding, restore, **pencarian config + version index/gaya git** |
| `NET07` | **Logs & counters** — firewall events + hitungan + **syslog/trap terpusat** (de-dup/korelasi) |
| `NET08` | **Change history** — audit `net_change` |
| `NET09` | **Hardening** — users/group, `/ip/service`, SSH keys, remote syslog |
| `NET10` | **Topology** — peta L2 (LLDP/CDP/FDB) + perangkat |
| `NET11` | **Discovery** — hasil sapuan subnet/SNMP/ARP, adopsi kandidat → perangkat |
| `NET12` | **Alert rules & events** — rule engine NET-side (match/recovery/mute/invert), threshold, daftar alert, ack/resolve, pemetaan ke `OBS` |
| `NET13` | **Groups** — grup perangkat/port dinamis (vendor/versi/subnet/tag), anggota, apply template/bulk |
| `NET14` | **Billing/95th percentile** — kuota bandwidth & laporan puncak 95th dari rollup |
| `NET15` | **Availability/SLA** — uptime, RTT/loss, alasan down (ICMP/SNMP) per perangkat |
| `NET16` | **VLAN & IP addresses** — VLAN bridge/port + IP address table per perangkat |
| `NET17` | **Hardware inventory** — pohon `entPhysical` (cage/SFP/PSU/fan) |
| `NET18` | **API tokens** — token read-only scoped untuk konsumen eksternal |
| `NET19` | **Maintenance windows** — jendela peredam alert (terikat job change/backup) |
| (monitoring) | Bisa ditautkan ke `OBS` untuk metrik/alert perangkat |

**Reuse:** `@/uix/datatable`, `@/lib/grid`, `/proxy/pages/*`, pola tab
(`APP02`/`APP04`), editor/editor-config YAML/`@uiw/react-codemirror` untuk
skrip/`.rsc` bila perlu.

## 8. Keamanan & RBAC

- **Kredensial** perangkat disimpan terenkripsi (`secret_enc`); tidak
  dikembalikan mentah ke klien.
- **API user least privilege**: grup RouterOS khusus (policies `api/read/write`
  minimal, idealnya hanya firewall bila memungkinkan); batasi `/ip/service`
  `api`/`api-ssl` `address` ke **IP agen `osc_auto/agent_vm`**; pakai API-SSL.
- **Anti-lockout**: jangan sampai mengubah chain `input` memutus akses; konfirmasi
  + dry-run + rollback.
- **Audit wajib**: `net_change` (before/after) + `USLogs`.
- **Isolasi tenant:** semua query difilter `company_id`.
- **Agen relay**: token `bot_agent` + mTLS; agen tidak akses DB.
- **API token read-only scoped** (`net_api_token`): hash saja (`token_hash`),
  `scopes` minimal (devices/interfaces/sensors/availability), batasi
  `device_ids`/`group_id`, `expires_at`, rotasi/revoke; **tanpa** akses tulis.

### 8.1 Otorisasi & RBAC

- Baca: `USRole("NET","VIEW")`; perubahan: `USRole("NET","POST")` (admin bypass).
- **Token eksternal** hanya **read-only** (scoped) via endpoint read-only khusus;
  tidak mewarisi `USRole` admin.

## 9. Retensi & Audit

- `net_firewall_event` (telemetry) → purge via `retention.go` (mis. 90 hari,
  `RE_DAYS_NET_FIREWALL_EVENT`).
- `net_interface_stat` (telemetry SNMP) → rollup + purge (mis. 90 hari,
  `RE_DAYS_NET_IFSTAT`); `net_interface_stat_rollup` disimpan lebih lama
  (mis. 1 tahun) untuk tren jangka panjang.
- `net_sensor` (health SNMP) → state terkini; riwayat opsional (retensi pendek).
- `net_syslog_event` (telemetry) → purge (mis. 90 hari, `RE_DAYS_NET_SYSLOG`);
  kolom de-dup (`dedup_key`/`count`) memadatkan banjir event.
- `net_alert` (event) → purge (mis. 180 hari, `RE_DAYS_NET_ALERT`);
  `net_alert_rule` persisten.
- `net_ping_result` → purge (mis. 30 hari, `RE_DAYS_NET_PING`);
  `net_availability` (SLA) disimpan lebih lama (mis. 1 tahun).
- `net_sensor_stat_rollup` (riwayat sensor/optik/PoE) disimpan lebih lama
  (mis. 1 tahun); `net_sensor` = state terkini.
- `net_config_revision` (index versi) → konten penuh dibatasi (mis. 60 revisi
  terbaru / 1 tahun, `RE_DAYS_NET_CONFIGREV`).
- `net_change` (audit) → disimpan lebih lama; `net_config_backup` dibatasi
  (mis. 30 snapshot terbaru / 180 hari).
- Data referensi (`net_device`, `net_firewall_rule`, `net_address_list_entry`,
  `net_alert_rule`, `net_device_group`, `net_billing`, `net_maintenance_window`,
  `net_custom_oid`, `net_api_token`) persisten; `net_vlan`/`net_ip_address`/
  `net_entity_physical` = state terkini (di-refresh tiap polling).

## 10. Integrasi Lintas-Modul

- **OBS** ([app_obs.md](app_obs.md)) — metrik perangkat (SNMP/agent) & alert;
  event `net_*` dipetakan ke `obs_alert_rule`/`obs_notification` (§6.4).
- **APP06 / notifikasi** ([app_sys.md](app_sys.md)) — dispatcher/notifikasi umum
  (email/webhook) bila transport memakai kanal internal `APP`.
- **WAF/SEC** — firewall router melengkapi WAF aplikasi.
- **Agent** — `osc_auto/agent_vm` sebagai **jalur tunggal** akses perangkat.
- **BOT** — registrasi/heartbeat agen (`bot_agent`) yang dipakai relay.
- **JMS** — penjadwalan poll/backup & job yang ditautkan `net_maintenance_window`.

## 11. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Agen & fondasi** | Klien RouterOS di `osc_auto/agent_vm` (**API biner + REST v7**), endpoint `/rest/agent/net/*`; perluas `net_device` (mgmt + `agent_id`); uji koneksi; inventaris (read). |
| **B. Monitoring** | Resource/interfaces + hitungan firewall (read); opsi tautan `OBS`. |
| **C. Firewall lengkap** | CRUD `filter`/`nat`/`mangle`/`raw` + address-list, enable/disable, reorder, clone/reset-counter, time-based rules; **safe apply** (dry-run + rollback otomatis) + audit `net_change`. |
| **D. Backup/diff/rollback** | `net_config_backup` (export `.rsc` + biner `.backup`), diff, restore. |
| **E. Templates & bulk** | Template aturan, bulk apply lintas device. |
| **F. Fleet** | Multi-device lintas agen. |
| **G. Hardening** | Users/group & `/ip/service`; SSH keys; remote **syslog**; halaman `NET09`. |
| **H. SNMP monitoring & topologi** | SNMP v2c/v3 poll (health + trafik) → `net_interface_stat`; trap/syslog receiver → `net_syslog_event`; L2 topology (LLDP/CDP/FDB) → `net_topology_link`; backup terjadwal + diff; halaman `NET10` + grafik di `NET03`/`NET07`. |
| **H2. Health, optik & discovery** | Sensor SNMP (`net_sensor`: suhu/tegangan/fan/PSU), **optik SFP DDM/DOM**, **PoE**; **rollup** `net_interface_stat_rollup`; **discovery** subnet/SNMP/ARP (`net_discovery` + adopsi, halaman `NET11`). |
| **I. Alerting & threshold** | `net_alert_rule`/`net_alert` (match/recovery/mute/invert), ambang per-sensor/per-port, syslog/trap-driven + de-dup, maintenance window/suppression, pemetaan `net_*`→`OBS`; halaman `NET12`/`NET19`. |
| **J. Grup & bulk** | `net_device_group` (grup perangkat/port dinamis) + apply template/bulk; halaman `NET13`. |
| **K. Billing, SLA & availability** | Billing/95th percentile (`net_billing`); `net_availability` + `net_ping_result` (RTT/loss, alasan down ICMP/SNMP); halaman `NET14`/`NET15`. |
| **L. Koleksi diperluas** | VLAN (`net_vlan`), IP address (`net_ip_address`), `entPhysical` (`net_entity_physical`), metadata interface; halaman `NET16`/`NET17`. |
| **M. Riwayat & kelas sensor** | `net_sensor_stat_rollup` (riwayat sensor/optik/PoE) + kelas **CURRENT/humidity**. |
| **N. Config search, custom MIB & token** | `net_config_revision` (pencarian/gaya git), `net_custom_oid`, `net_api_token`; halaman `NET06`/`NET18`. |

> ⏸️ Fase otomasi/intel (auto-block, scripts, discovery MNDP/RoMON), VPN, torch,
> dan read-only leases/ARP/DNS **ditangguhkan** (§1.1).

## 12. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Perubahan memutus akses (lockout) | Snapshot + dry-run + **rollback otomatis** + peringatan chain `input`. |
| Kredensial bocor | Enkripsi `secret_enc`, API user least privilege, API-SSL, batasi alamat. |
| Perbedaan versi RouterOS (v6/v7) | Klien mendukung API biner (v6/v7) & REST v7; dipilih per perangkat. |
| Perangkat tidak terjangkau | **Semua akses via agen** `osc_auto/agent_vm`; timeout/retry. |
| Perubahan tak teraudit | `net_change` + `USLogs` wajib. |
| Kredensial SNMP bocor | Simpan `snmp_community_enc`/v3 terenkripsi; utamakan SNMPv3 auth+priv; batasi akses ke IP agen. |
| Banjir syslog/trap | Rate-limit receiver, retensi pendek, level minimum, agregasi. |

## 13. Non-Goals

- Fitur RouterOS di luar firewall (routing/dhcp/ppp/queue/wireless/mpls) —
  non-goal fase awal; cakupan penuh: **filter/NAT/mangle/raw + address-list**.
- Multi-vendor (Cisco/Huawei/dll.) — **MikroTik saja** (sesuai keputusan).
- Memindahkan/memantau trafik (hanya konfigurasi & metrik).
- **Ditangguhkan** (keputusan terakhir, §1.1): VPN MikroTik; auto-block/threat
  feed; discovery MNDP/RoMON/ARP; scripts/scheduler; torch; read-only DHCP
  leases/ARP/DNS.
- **Distributed poller** (horizontal scaling polling ala LibreNMS: banyak worker
  terkoordinasi) — **non-goal**; polling dilakukan single-poller dari agen
  `osc_auto/agent_vm`.
- **NetFlow/sFlow/NetStream** traffic accounting — **non-goal**; hanya metrik
  interface (SNMP) + `net_interface_stat`, bukan analisis flow.
- **Monitoring wireless/AP** — **non-goal** (lihat baris di atas: wireless di
  luar cakupan; RouterOS `/interface/wireless` tidak dikelola).

## 14. Keputusan ✅ (terkonfirmasi)

- [x] Modul **`NET`** (MikroTik digabung ke NET); prefix **`net_*`**.
- [x] Transport: **keduanya** — RouterOS API biner (v6/v7) **dan** REST v7.
- [x] Koneksi: **via agen `osc_auto/agent_vm`** (backend tidak menyambung langsung).
- [x] Cakupan: **semuanya** — firewall (filter/NAT/mangle/raw) + address-list.
- [x] Vendor: **MikroTik** saja.
- [x] **Dry-run + rollback otomatis** untuk setiap perubahan berisiko.

### 14.1 Keputusan lanjutan ✅ (terkonfirmasi)

- [x] Fase G/H — **hanya hardening**: `/user`+group, `/ip/service`, SSH keys,
  remote **syslog**.
- [x] **VPN MikroTik** — **non-goal / ditangguhkan**.
- [x] **Auto-block/threat feed** — **ditangguhkan**.
- [x] **Discovery** MNDP/RoMON/ARP — **ditangguhkan**.
- [x] **Scripts/scheduler** — **ditangguhkan** (kecuali time-based rules firewall).
- [x] **Torch/live traffic & read-only DHCP leases/ARP/DNS** — **ditangguhkan**.
- [x] **SNMP monitoring + topologi L2 + trap/syslog receiver** — **ditambahkan**
  (mengaktifkan kembali discovery via SNMP LLDP/CDP/FDB & ARP).
- [x] **Health/optik/PoE SNMP** (`net_sensor` + SFP DDM/DOM + PoE) dan **rollup**
  jangka panjang (`net_interface_stat_rollup`) — **ditambahkan**.
- [x] **Discovery SNMP/subnet/ARP** (`net_discovery` + adopsi) — **aktif**;
  MNDP/RoMON tetap ditangguhkan.
- [x] **Alerting & rule engine NET-side** (match/recovery/mute/**invert**) +
  pemetaan event `net_*` → transport `OBS` (§6.4) — **ditambahkan**.
- [x] **Ambang batas per-sensor/per-port** + wiring alert — **ditambahkan**.
- [x] **Grup perangkat & grup port dinamis** (fleet/bulk & apply template) —
  **ditambahkan**.
- [x] **Billing/95th percentile**; **Availability/SLA + RTT/loss + alasan down**
  (ICMP/SNMP) — **ditambahkan**.
- [x] **Riwayat sensor/optik/PoE (rollup)** + **kelas sensor tambahan** (CURRENT/
  humidity) — **ditambahkan**.
- [x] **VLAN discovery**, **IP address table**, **inventaris ENTITY-MIB**,
  **metadata interface** — **ditambahkan** (SNMP, via agen).
- [x] **Syslog/trap-driven alerting + de-dup/rate correlation**; **maintenance
  window/suppression** (terikat job change/backup) — **ditambahkan**.
- [x] **Pencarian config + version index gaya git**; **custom MIB/OID**; **API
  token read-only scoped** — **ditambahkan**.
- [x] **Cek update & backup terjadwal via `JMS`** (SNMP poll & config backup/diff
  berkala dijadwalkan lewat `JMS`).
- [ ] **Approval** perubahan chain `input` via `APP04` + RBAC `BOOK`? (belum)

## 15. Referensi Internal (aset yang bisa dipakai ulang)

- WebSocket/relay pola: `osc_rest/mechanic/sshproxy.go`.
- Route & grup: `osc_rest/backbone/routes.go` (`pages`, `admin`, `agent`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Retensi: `osc_rest/backbone/retention.go`.
- Agen: `osc_auto/agent_vm` (relay; backend = penghubung DB).
- Konvensi cluster DB: `osc_base/prisma/schema/cluster_net.prisma`,
  [database/README.md](../database/README.md).
- Referensi eksternal: MikroTik RouterOS API/REST, WinBox.
