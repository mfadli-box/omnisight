# Osc_base — `prisma/schema/cluster_net.prisma`

> Dokumen detail cluster **NET** — Network Monitoring (`net_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster NET menyimpan inventaris jaringan: subnet, perangkat, dan antarmuka.
Sebagian besar **referensi/persisten**; model pemantauan (`net_interface_stat`,
`net_sensor`, `net_alert`, `net_ping_result`, dll.) bersifat **telemetry
beretensi** (lihat [../planning/app_net.md](../planning/app_net.md) §9).

## 2. Model

### 2.1 `net_subnet`
- `@@unique([company_id, code])`; kolom `cidr`, `gateway`, `vlan`, `description`.
- Induk opsional bagi `net_device`.

### 2.2 `net_device`
- `@@unique([company_id, code])`; indeks `company_id`, `subnet_id`, `status`.
- `device_type` ∈ `ROUTER | SWITCH | AP | FIREWALL | SERVER | OTHER`.
- `status` ∈ `UP | DOWN | UNKNOWN`; `last_seen` untuk pemantauan.
- Rencana: `tags` (Json) sebagai dasar **grup dinamis** (vendor/`ros_version`/
  subnet/tag); `down_reason` (ICMP/SNMP) disimpan di `net_availability`.

### 2.3 `net_interface`
- `@@unique([device_id, name])`; `onDelete: Cascade` dari `net_device`.
- Kolom `if_index`, `mac_address`, `ip_address`, `speed_mbps`, `status`.
- Rencana: metadata & ambang — `if_alias`, `description`, `admin_status`,
  `duplex`, `mtu`, `vlan_id`, `th_warn_pct`, `th_low_pct`.

## 3. Relasi Inti

```text
net_subnet (1) ──► (N) net_device (1) ──► (N) net_interface
```

## 4. Rencana (manajemen MikroTik)

Pengelolaan **MikroTik** (terutama firewall) direncanakan menambah kolom
manajemen pada `net_device` (vendor/protokol/kredensial terenkripsi) serta tabel
`net_firewall_rule`, `net_address_list_entry`, `net_config_backup`,
`net_change`, dan `net_firewall_event` — **belum dibangun**, akses via agen
`osc_auto/agent_vm`.

**SNMP ala LibreNMS** menambah `net_interface_stat` (+ `net_interface_stat_rollup`
untuk tren jangka panjang), `net_sensor` (health: suhu/tegangan/fan/PSU),
optik SFP DDM/DOM & PoE (kolom di `net_interface_stat`), `net_syslog_event`
(trap/syslog), `net_topology_link` (L2 LLDP/CDP/FDB), dan `net_discovery`
(sapuan subnet/SNMP/ARP + adopsi). ⏸️ `net_blocklist`/`net_block_entry`/
`net_script` **ditangguhkan**; VPN/auto-block/MNDP-RoMON/scripts/torch/read-only
non-goal fase awal. Rincian: [../planning/app_net.md](../planning/app_net.md).

**Kelengkapan kesejajaran LibreNMS (audit)** menambah:

| Model | Isi pokok |
|---|---|
| `net_alert_rule` / `net_alert` | Rule engine ambang **NET-side** (match/recovery/mute/invert) + event; transport tetap `OBS`. |
| `net_device_group` | Grup **dinamis** (vendor/`ros_version`/subnet/tag) untuk **device & port**. |
| `net_billing` | Billing/kuota **95th percentile** di atas `net_interface_stat_rollup`. |
| `net_availability` / `net_ping_result` | SLA/uptime + riwayat **RTT/loss** + alasan down (**ICMP/SNMP**). |
| `net_sensor_stat_rollup` | Riwayat time-series **sensor/optik/PoE**. |
| `net_vlan` / `net_ip_address` | **VLAN** (bridge/port) & **IP address table** (SNMP). |
| `net_entity_physical` | Inventaris **ENTITY-MIB `entPhysical`** (cage/SFP/PSU/fan). |
| `net_maintenance_window` | Peredam alert, terikat job change/backup (`JMS`). |
| `net_config_revision` | Index/versi config (**pencarian**, gaya git) di atas `net_config_backup`. |
| `net_custom_oid` | Pemetaan **OID/MIB custom** untuk health board-spesifik. |
| `net_api_token` | Token **read-only scoped** untuk konsumen eksternal. |

Perluasan kolom: `net_sensor` (+ `warn_high`/`warn_low`/`low_warn`, kelas
**CURRENT/HUMIDITY**); `net_syslog_event` (+ `dedup_key`/`count`/`first_seen`/
`last_seen`). Semua tetap **MikroTik/SNMP**, **via agen**, **dry-run + rollback**
untuk perubahan; tanpa VPN/auto-block/MNDP-RoMON/scripts/torch. Rincian:
[../planning/app_net.md](../planning/app_net.md).

## 5. Catatan

- Konvensi umum model: [README.md](README.md#4-konvensi-model).
