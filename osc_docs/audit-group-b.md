# Audit Statis Grup B: `netbox`, `librenms`, `uptime-kuma`, `nginx-ui`

- **Date**: 2026-11-12
- **Author**: ai-main (PM, System Analyst & Docker DevOps Architect) — dengan delegasi audit statis 4 subagen paralel
- **Source Target**:
  - `netbox` — https://github.com/netbox-community/netbox @ `cf6d3f0` (2026-11-11) — Django 6.x, PostgreSQL-only, NetBox 4.6
  - `librenms` — https://github.com/librenms/librenms @ `798fcea8` (2026-11-12) — PHP/Laravel + RRD + net-snmp CLI
  - `uptime-kuma` — https://github.com/louislam/uptime-kuma @ `02d5012` (2026-11-11) — Node/Socket.IO, redbean-node (SQLite/MariaDB via Knex), fork modern (better-auth + stat tables)
  - `nginx-ui` — https://github.com/0xJacky/nginx-ui @ `4a73492` (2026-11-11) — Go (Gin + GORM + Cosy) + Vue 3, SQLite gorm, lego v5
- **Scope**: Re-engineering audit — model DCIM/IPAM (NetBox), SNMP polling & port metrics (LibreNMS), synthetic monitor & status page (Uptime Kuma), manajemen virtual host & SSL Nginx (Nginx UI)
- **Aturan**: `git clone --depth 1` ke `.rea_docs/` (gitignored) — **inspeksi statis murni**, tidak ada `npm/composer/pip install`, build, atau eksekusi script apa pun (anti supply-chain)
- **Delegasi**: analisis mendalam via 4 subagen `explore` paralel (1 repo / subagen)
- **Checklist Ref**: `osc_docs/checklist.md` — Hari 2 (`SESI 0.2`)
- **Rekan Audit Grup A**: `osc_docs/audit-group-a.md`

---

## 1. Executive Summary

| Repo | Stack | Lapisan yang diaudit | Pola inti yang harus dipindahkan |
| :--- | :--- | :--- | :--- |
| `netbox` | Python/Django 6, PostgreSQL (ltree, inet/cidr, GIN/GIST, trigger) | DCIM & IPAM | Hierarki `NestedLtreeGroupModel` (`path ltree` + trigger + advisory lock); `inet/cidr` + GIST `inet_ops`; konstanta status TextChoices; FK PROTECT/SET_NULL/CASCADE; CustomField via kolom `custom_field_data JSONB`; ObjectChange (pre/post JSONB snapshot) + ObjectPermission (`constraints` Q-dict JSONB); CablePath JSONB + denormalisasi `_path_id` |
| `librenms` | PHP ≥ 8.x/Laravel + RRDtool + net-snmp CLI | SNMP polling, discovery, port metrics, sensor, alert | Scheduler DB-driven (`last_polled` + `poller_group`, job per 10 s); abstraksi per-device polling method (`device_polling_methods`); discovery deklaratif YAML per-OS (717 file, `num_oid` template `{{ $index }}`); delta/rate port (prev/delta/rate kolom); RRD DS metadata (GAUGE/DERIVE, step 300, hb 600); sensor divisor/multiplier/limits + state translation; kredensial SNMP **terenkripsi** di tabel `secrets` (pola baru 2026); alert state machine (alerts/alert_log/alert_faults) |
| `uptime-kuma` | Node 2.x, Socket.IO, SQLite/MariaDB | Synthetic monitor, heartbeat/uptime, status page | Monitor polymorphic tunggal (type discriminated, kolom `config` JSON extensible); self-scheduling `setTimeout` loop per monitor; state machine beat (UP/PENDING/DOWN/MAINTENANCE + maxretries + resend_interval); **rolling bucket stats** (`stat_minutely/hourly/daily`, UNIQUE(monitor_id,timestamp), upsert — tidak scan heartbeat saat query); heartbeat `important` hanya pada transisi status (partial index); push monitor via `push_token`; status page SSR + group/weight publikasi; better-auth (scrypt, TOTP 2FA, API key hashed + rate limit) |
| `nginx-ui` | Go (Gin/Cosy/GORM, SQLite), lego v5 | Virtual host & SSL Nginx | Pipeline simpan site: **validasi → history DB → tmp+rename → `nginx -t` → rollback → reload (global apply lock)**; AST gonginx (NgxConfig/NgxServer/NgxDirective dengan `Raw` verbatim); sandbox `nginx -t` per-namespace (rewrite include + hash dependensi eksternal); symlink sites-available↔enabled; ACME lego (HTTP-01 port 9180 / DNS-01 plugin), auto-renew gocron 30 mnt + **ARI** (renewal scheduling RFC 9773), fail cooldown 12 h; sertifikat atomik 0644/0600, path invariant di bawah conf dir; JWT HS256 + AuthToken DB-backed (revocable) + TOTP/passkey (WebAuthn) + step-up secure session; enkripsi at-rest AES (legacy CFB — naikkan ke GCM di target) |

Keempat sistem adalah referensi utama untuk **Wave 1–2 omnisight**: skema Prisma P2 (DCIM/IPAM, Hari 7), P3 (telemetry/uptime/nginx, Hari 8), Rust API Wave 2 (SNMP ingest, uptime, nginx control plane — Hari 13), Golang agents `network_poller` & `infra_control` (Hari 14), Next.js NOC dashboard (Hari 15). Detail per repo:

---

## 2. NetBox — Model DCIM & IPAM

### 2.1 Fondasi model (inheritance abstract, single-table — tanpa MTI)

- PK selalu `id BIGSERIAL`; **tanpa composite PK** — uniqueness via `UniqueConstraint` (tidak ada lagi `unique_together` di dcim/ipam). Kolom audit universal: `created TIMESTAMP NULL`, `last_updated TIMESTAMP NULL`.
- Hierarki: `BaseModel` (RestrictedQuerySet, coercing `''`→NULL) → `ChangeLoggingMixin` → `NetBoxFeatureSet` (Bookmarks + ChangeLogging + Cloning + CustomFields/Links + CustomValidation + ExportTemplates + Journaling + Notifications + Tags + EventRules) → `NetBoxModel`; **`PrimaryModel`** (+owner, `description`, `comments`); **`OrganizationalModel`** (`name unique`, `slug unique`); **`ChangeLoggedModel`** (ringan, tanpa tags/CF — dipakai `CableTermination`, `FHRPGroupAssignment`, `VLANTranslationRule`).
- **`NestedLtreeGroupModel`** (modern): `name(100)`, `slug`, `parent` self-FK CASCADE NULL + kolom **`path ltree`** + **`sort_path text`** yang di-maintain **trigger Postgres** (`InstallLtreeTriggers` — BEFORE/AFTER, advisory lock per transaksi per pohon, retry 40P01 deadlock). Lookup terdaftar: `ancestor/ancestor_or_equal/descendant/descendant_or_equal` (`@>`/`<@`) + GistIndex(path). Dipakai Region, SiteGroup, Location, DeviceRole, Platform. Legacy MPTT (`lft/rght/tree_id/level`) tersisa hanya untuk kompatibilitas plugin (ModuleBay, InventoryItem).
- `WeightMixin`: `weight Decimal(8,2)` + `weight_unit` + `_abs_weight` (normalisasi ke gram). `CachedScopeMixin` (Prefix): `scope_type/scope_id` GenericFK + cache denormalisasi `_site/_region/_site_group/_location`.
- API nesting via `WritableNestedSerializer` — menerima PK int **atau** `{slug}/{name}`; **tidak ada NaturalKeyOrPKField** di tree ini.

### 2.2 DCIM inti

| Model | Kolom kunci | Konstrain / catatan |
| :--- | :--- | :--- |
| `Region`, `SiteGroup` | ltree + `parent` | UNIQUE `(parent,name)`, `(parent,slug)` **nulls_distinct=False**; GIST path |
| `Site` | `status` (`planned\|staging\|active\|decommissioning\|retired`, def `active`), region/group/tenant, facility(50), M2M asns, lat/long Decimal(8,6)/(9,6) | `name` unique dengan collation **natural_sort** |
| `Location` | ltree + `site` PROTECT, status, tenant | UNIQUE `(site,parent,name)` & `(site,parent,slug)` nulls_distinct=False |
| `RackType` / `Rack` | width 19/21/23, `u_height` 1..68, form_factor, outer unit, weight, cooling | UNIQUE `(location,name)` & `(location,facility_id)` — **unique dalam Location**; `units int[]` cache posisi U; `rack_type` meng-inherit field bila diisi |
| `RackReservation` | `units int[]`, status `active\|pending` | user + tenant |
| `DeviceType` | manufacturer, model/slug, `u_height Decimal(4,1)` (step 0.5), subdevice_role, airflow | ~13 kolom **counter denormalisasi** (CounterCacheField) |
| `Device` | type/role/site PROTECT; platform/rack SET_NULL/PROTECT; `name(64) NULL` natural_sort; serial; asset_tag unique; `position/face`; status (`offline\|active\|planned\|staged\|failed\|inventory\|decommissioning`); `primary_ip4/ip6/oob_ip` OneToOne→IPAddress SET_NULL; `_config_context_data JSONB` cache | UNIQUE `Lower(name)+site+tenant` (conditional name NOT NULL, nulls_distinct=False); UNIQUE `(rack,position,face)`; `(virtual_chassis,vc_position)`; partial index `_config_context_data IS NULL`; create → bulk_create komponen anak dengan denormalisasi `_site/_location/_rack` |
| `VirtualChassis`, `VirtualDeviceContext` | master OneToOne; VDC `(device,identifier)` & `(device,name)` | VDC status `active\|planned\|offline` |
| `MACAddress` | `mac_address` CharField ternormalisasi + GenericFK `assigned_object` | index `(assigned_object_type,assigned_object_id)` |

**Komponen device** (`ComponentModel` abstract): `device CASCADE`, `name(64)`, `label`, denormalisasi `_site/_location/_rack` SET_NULL; UNIQUE `(device,name)`. `CabledObjectModel`: `cable SET_NULL`, `cable_end A|B`, `cable_connector 1..64`, `cable_positions int[]`, `mark_connected`. `PathEndpoint`: `_path_id` → CablePath (denormalisasi). Konkrit: ConsolePort (tipe konektor + speed), PowerPort (`maximum_draw/allocated_draw` W), PowerOutlet (status/feed_leg A|B|C), FrontPort/RearPort (`positions`), PortMapping (mapping front↔rear dengan UNIQUE per posisi), DeviceBay, ModuleBay (MPTT), InventoryItem.

**Interface** (paling kompleks): `type` InterfaceTypeChoices (ratusan nilai: ethernet beragam speed, virtual/lag/bridge, wifi a/be, sonet, infiniband, channel); `enabled`, `mtu 72..65536`, `mode access|tagged|tagged-all|q-in-q`, self-FK `parent/bridge/lag`, `mgmt_only`, `speed Kbps`, `duplex`, `wwn`, RF (role/channel/freq/width/tx_power), PoE mode/type, `vrf`, `untagged_vlan`, M2M `tagged_vlans` (through `dcim_interface_tagged_vlans`), `qinq_svlan`, `primary_mac_address` OneToOne, M2M vdcs; UNIQUE `(parent,channel_id)`.

**Cabling & power**: `Cable` (type ~20 nilai fiber/tembaga, status `connected|planned|decommissioning`, **profile ~30 nilai** single/trunk/breakout, `_abs_length` meter Decimal(14,4)); `CableTermination` (ChangeLoggedModel, GFK termination, UNIQUE `(termination_type,termination_id)` — satu endpoint satu kabel, UNIQUE `(cable,cable_end,connector)`, cache `_device/_rack/_location/_site`); `CablePath` (private: `path JSONB` nested `[ct_id,id]`, `is_active/is_complete/is_split`, `_nodes text[]` + **GinIndex @>**). Trace: walk terminations→link→terminations, resolusi pass-through via **position stack** + PortMapping; retrace via signal pada setiap mutasi cable/termination (thread-local untuk menghindari retrace per-row saat cascade delete). `PowerFeed`: `type primary|redundant`, `supply ac|dc`, `phase`, voltage/amperage/max_utilization 1..100, `available_power` VA.

### 2.3 IPAM inti

| Model | Kolom kunci | Catatan |
| :--- | :--- | :--- |
| `VRF` | `rd` unique NULL (31, format `<asn>:<n>`), `enforce_unique` def True, M2M RouteTarget import/export (through table masing-masing) | |
| `RouteTarget` | `name` unique (31) | |
| `Aggregate` | `prefix cidr`, rir PROTECT | overlap dicek **app-level** |
| `Prefix` | `prefix cidr`, vrf, status `container\|active\|reserved\|deprecated`, role, `is_pool`, `_depth/_children` denormalisasi, scope cache | **GIST `inet_ops`** index; **TIDAK ADA unique DB** (vrf,prefix) — app-level; lookup custom `net_contained(<<)/net_contains(>>)` |
| `IPRange` | `start/end inet`, size computed, status, role | btree **expression index** `host(start/end_address)` |
| `IPAddress` | `address inet`, status `active\|reserved\|deprecated\|dhcp\|slaac`, role (`loopback\|secondary\|anycast\|vip\|vrrp\|hsrp\|glbp\|carp` — role anycast/VIP **bebas dari uniqueness**), GFK `assigned_object` (Interface/VMInterface/FHRPGroup), `nat_inside` self-FK, `dns_name` | expression index `host(address)`; uniqueness app-level |
| `VLANGroup` | `vid_ranges int4range[]` (def `{1..4095}`), scope GFK | UNIQUE `(scope,name)/(scope,slug)` |
| `VLAN` | `vid 1..4094`, `site/group`, status, qinq_role svlan/cvlan | UNIQUE `(group,vid)`, `(group,name)`, `(qinq_svlan,vid)` |
| `ASNRange` / `ASN` | bigint ASN 1..2^32-1; ASN unique | rir, role |
| `FHRPGroup` / `FHRPGroupAssignment` | protocol `vrrp2/3\|hsrp\|hsrp2\|glbp\|carp`, auth_type/key; GFK interface + priority 0..255 | UNIQUE `(interface_type,interface_id,group)` |
| `Service(Template)` | GFK parent (Device/VM/FHRPGroup), **`port_mappings text[]`** (`'tcp/80'`) + GinIndex, M2M IPAddress | |
| `VLANTranslationPolicy/Rule` | local/remote_vid | UNIQUE `(policy,vid)` masing-masing |

### 2.4 Custom fields, tag, permission, change log

- **CustomField**: `type text|integer|boolean|date|url|json|selection|multiselect|object|multiobject`; `name` regex `^[a-z0-9_]+$` (no `__`), unique; required/unique/search_weight/filter_logic loose|exact; default JSONB; validation min/max/regex/schema JSONB; `CustomFieldChoiceSet` (base + extra_choices JSONB + colors); UI visibility. **Storage**: kolom `custom_field_data JSONB NOT NULL DEFAULT '{}'` pada setiap model; validasi & uniqueness **app-level** (query key-path); rename field = background job menulis ulang key.
- **Tag/TaggedItem**: taggit dengan `object_types` restriction M2M + weight; through table polymorphic.
- **ObjectPermission**: `object_types M2M`, `actions text[]` (`view/add/add::dcim.site`), **`constraints JSONB`** (Django Q-dict, list = OR) → queryset `.restrict()` — RBAC object-level app-side, tidak ada RLS DB. Selaras dengan temuan Directus di Grup A → standar target: policy + item-rule, evaluasi per query.
- **ObjectChange** (`core_objectchange`): GFK changed/related, `action create|update|delete`, `request_id UUID`, `object_repr`, **`prechange_data/postchange_data JSONB`** snapshot penuh; dedup per request via middleware. **JournalEntry** (GFK, kind info/success/warning/danger). **EventRule**: `event_types text[]` (`object_created/...`), conditions JSONB, action webhook/notification/script; **Webhook** memakai `secret` **HMAC signing** + timeout 1..255.
- `ObjectType` (proxy ContentType + `features text[]` GIN) — registry fitur untuk GenericFK filtering.

### 2.5 Fitur PostgreSQL yang wajib direplikasi (atau diganti sadar)

1. **ltree** + trigger + advisory lock — Prisma tidak mendukung: pilihan (a) shipping trigger via SQL migration raw, atau (b) path enumeration text/uint yang dikelola di Rust (rekomendasi target: opsi b untuk portabilitas, minus GIST ancestor query yang bisa diganti btree `(path)`).
2. **inet/cidr** — Prisma: `Unsupported("inet")`/`"cidr"` + `ipnetwork` crate di Rust; pertahankan GIST `inet_ops` untuk containment query prefix.
3. GIN (`_nodes text[]`, `port_mappings`, `features`), GIST (path, prefix), **`UNIQUE NULLS NOT DISTINCT`** (PG15+), expression index (`host()`, `lower(name)`), ICU collation `natural_sort` (buat collation di Postgres atau sort natural di Rust).
4. Counter denormalisasi + JSONB cache (`_config_context_data`) — pertahankan pola (update via transaksi tulis, bukan trigger bila memungkinkan).
5. FK semantics: PROTECT dominan, SET_NULL untuk cache/denormalisasi, CASCADE untuk komponen. **Validasi koherensi (site/rack/location, occupancy rack, assignment IP, overlap prefix/aggregate, vid range) semuanya app-level** — wajib diimplementasikan ulang di Rust API layer, bukan mengandalkan DB.

---

## 3. LibreNMS — SNMP Polling & Port Metrics

### 3.1 Pipeline polling

- **Dua jalur**: legacy CLI (`poller.php` + `includes/polling/*.inc.php`) dan **modern Laravel queue**: `app/Jobs/DispatchPollingWork.php` (tick 10 s, `LOOKAHEAD`, `EARLY_START=3`) menghitung device due via SQL `UNIX_TIMESTAMP(last_polled) − COALESCE(last_polled_timetaken,0) + poll_interval − UNIX_TIMESTAMP()` → enqueue `PollDevice` (tries=4, timeout=600, unique lock) ke queue per `poller_group` (`'poll'` / `'poll-{group}'`). Legacy Python: `LibreNMS/service.py` (dispatcher + master election + `poller_cluster`/`poller_groups`).
- `PollDevice`: init → `CheckDeviceAvailability` (ICMP/SNMP reachability) → `pollModules()` iterasi modul terpasang (`LibreNMS/Modules/*`: Ports, Mempools, Processors, Storage, Ospf, BgpPeers, Vlans, Wireless, ArpTable, FdbTable, DiscoveryProtocols…) → record performance → events.
- **Abstraksi polling method** (`LibreNMS/Polling/Method/`): per-device baris tabel `device_polling_methods` (UNIQUE `(device_id, method_type)`, `enabled`, `affects_availability`, **`secret_id`**, `settings JSON`, `last_checked_at`, `last_check_successful`). Jenis: SNMP/ICMP/IPMI/ProxmoxApi/UnixAgent. Default SNMP: `{version v2c, udp, port 161, timeout 1, retries 5, max_oid 10, bulk, context, port_association_mode ifIndex}` dengan override per-OS (`getOsSetting`).
- Distributed: `pollers` (poller_name unique, last_polled, devices, time_taken) + `poller_cluster`/`poller_cluster_stats`; `devices.poller_group` default 0. **Scheduler 100% DB-driven** — pola yang cocok diporting ke Golang `network_poller` (poll loop berbasis due-ness, bukan cron statis).

### 3.2 Discovery deklaratif

- `discovery.php` → `includes/discovery/functions.inc.php`: `discover_sensor(class, device, oid, index, type, descr, divisor, multiplier, limits, current, poller_type, entPhysicalIndex, user_func, group, rrd_type, category)`.
- **Dynamic discovery** via YAML per-OS: `resources/definitions/os_discovery/*.yaml` (**717 file**), diperiksa oleh JSON schema (`os_schema.json`); OS detection juga YAML (`os_detection/*.yaml`) via `sysObjectID`/`sysDescr`/hardware. Sensor entry: `oid`, `num_oid: '.1.3.6...{{ $index }}'` (template substitusi posisi sederhana), `value`, `options`, `states`.
- Klasik: `includes/discovery/sensors/<class>/{os_group,os}.inc.php` (temperature, voltage, current, fanspeed, power, humidity, dbm, state, runtime, …) dengan base generik ENTITY-MIB (`entity-sensor.inc.php`).
- SNMP helper (`includes/snmp.inc.php`) shell-out ke net-snmp CLI (`snmpget/snmpbulkwalk`); wrapper `snmp_get/_multi/_next/walk/walk_cache_oid/walk_group/walk_array_num`; `pre_cache` per modul.
- Sinkronisasi tabel: `LibreNMS/DB/BulkTableSync.php` (`SyncsModels` trait) — walk → match/dedupe → sync upsert → tulis RRD. Pola yang diporting: **discovery deklaratif data-driven** (bukan hardcoded per-OS) untuk agent Golang.

### 3.3 Port metrics

- OID deskriptor: `ifName/ifDescr/ifAlias/ifAdminStatus/ifOperStatus/ifMtu/ifSpeed/ifType/ifPhysAddress/ifDuplex…`; counter: `ifIn/OutOctets` (+**HC variants diprioritaskan**, fallback uji `ifHCInOctets`), Errors, Ucast/NUcast/Broadcast/MulticastPkts, Discards, UnknownProtos.
- **Delta state di DB**: per counter simpan `<oid>`, `<oid>_prev`, `<oid>_delta`, `<oid>_rate` + `poll_time/poll_prev/poll_period`; rate = `(cur−prev)/period`, negatif → 0 + eventlog; `bits_rate = octets_rate × 8`. Skip stat saat port down & `ifLastChange` tidak berubah.
- **RRD** `port-id{port_id}.rrd`: DS DERIVE (max 12.5e9) untuk 17+ counter; `RrdDefinition::addDataset(name [a-zA-Z0-9_] ≤19 char, type GAUGE/DERIVE/COUNTER/ABSOLUTE, min, max, heartbeat, …)`; step 300, heartbeat config, RRAs dari `rrd_rra`. Backend `Rrdtool` (long-lived process pipe + `rrdcached`) / `PhpRrd`; **circuit breaker** 3 fail → suspend + backoff eksponensial 30s×2^n max 600s + eventlog. Path `rrd/<hostname>/<file>.rrd` dengan sanitasi.
- **Implikasi re-engineering**: RRD diganti tabel time-series Postgres; **metadata DS (name/type/min/max/heartbeat/step) harus dipertahankan sebagai schema metadata** agar angka konsisten; delta/rate math wajib identik di agent Golang.

### 3.4 Sensor & skema data

- `sensors`: `sensor_class` (varchar64 indexed — temperature/voltage/state/…), `sensor_oid`, `sensor_index(128)`, `sensor_type` (OS subtype), `sensor_descr`, `sensor_divisor` bigint def 1, `sensor_multiplier` int def 1, `sensor_current` double, `sensor_limit`(crit high)/`_warn`/`_low`/`_low_warn`, `sensor_alert` bool, `sensor_custom` enum (user-edited limits), `entPhysicalIndex(+_measured)`, `rrd_type`, `category`, `sensor_deleted`.
- **State sensors**: `sensors_to_state_indexes` (UNIQUE pair) → `state_indexes` (state_name unique) → `state_translations` (`state_value` int, `state_descr`) — nilai OID numerik dipetakan ke deskriptor. `wireless_sensors` paralel (`sensor_oids` text multi-OID, `sensor_aggregator`).
- Tabel lain: `devices` (lihat §3.6), `ports` (UNIQUE `(device_id,ifIndex)`) + `ports_statistics` (rate extended) + `ports_adsl/vdsl/stack/fdb/nac/stp`, `processors` (oid/index/type/usage/precision/perc_warn 75), `mempools` (perc/used/free/total, perc_warn 75), `storage` (mib/index/units/used/free/perc, perc_warn 60), `ospf_instances/areas/nbrs/ports`, `bgpPeers` (+`bgpPeers_cbgp2` per AFI/SAFI), `vlans` + mapping port-vlan, `devices_attribs` (kv per device).

### 3.5 Alerting

- `alert_rules`: `rule` (teks SQL fragmen), `severity ok|warning|critical`, `extra JSON` (delay/interval/invert/count/mute), `builder` JSON (query-builder tree), `query` (SQL generasi). Operator map (`LibreNMS/Alerting/QueryBuilderParser.php`): `equal→=`, `not_equal→!=`, `less/greater(_or_equal)`, `between→BETWEEN`, `begins_with/contains/ends_with→LIKE %…%`, `is_empty/is_null` (+NOT).
- Evaluasi: rule ≈ `SELECT device_id FROM devices WHERE <rule>` per device (makro `%macros.x`/`%devices.x` disubstitusi string — **SQLi by design, WAJIB diparameterisasi di port Rust**).
- State machine (`RunAlerts`): `alerts` (state ringan), `alert_log` (details serialized — risiko PHP object injection, hindari di target), `alert_faults` per-fault, `alert_schedule` (maintenance), transports/templates + transport_map/groups; status: 0=ok, 1=alert, 2=ack, dst. `extra.delay/interval/mute` dihormati.

### 3.6 Keamanan — ADOPT vs AVOID

- **ADOPT (pola baru 2026)**: tabel **`secrets`** (`description unique`, `secret_type` enum `snmp-community|snmp-v3|ipmi|…`, `data` terenkripsi via Laravel encryptor AES-256-CBC, `hidden=['data']`, policy-gated, DTO ter-tipe `SnmpCommunitySecretData/SnmpV3SecretData`, dedup kredensial identik per type+data). `device_polling_methods.secret_id` FK → device→method→secret. **`2026_10_25_drop_device_snmp_fields`** menghapus kolom community/auth* dari `devices`.
- **AVOID (legacy)**: plaintext `devices.community/authpass/cryptopass`; net-snmp CLI membocorkan community via `ps` (shell exec); `alert_log.details` serialized PHP; substitusi string makro alert ke SQL.
- **Target omnisight**: kredensial SNMP/HMAC agent di vault Envelope Encryption (AES-256-GCM standar ai-rest) — selaras sempurna dengan pola `secrets` baru LibreNMS; polling agent mengambil blob terenkripsi via API dan mendekripsi dengan agent key.

---

## 4. Uptime Kuma — Synthetic Monitor & Status Page

> Catatan: clone ini fork modern (better-auth menggantikan JWT/session legacy; tabel stat bucket; kolom `config` JSON baru). ORM redbean-node (SQLite/MariaDB via Knex).

### 4.1 Model monitor (polymorphic tunggal, ~90 kolom)

- `type` mendiskriminasi semua check: `http, keyword, json-query, push, docker, radius, kafka-producer, group` inline + plugin `server/monitor-types/*`: dns, gamedig, grpc, mongodb, mssql, mysql, ntp, postgres, rabbitmq, redis, sftp, sip-options, smtp, snmp, steam, tcp, websocket-upgrade, real-browser, dsb.
- Kolom inti: `name(150), description, active, user_id, interval def 20, weight def 2000, url, method GET, timeout` (runtime = `interval*0.8` bila 0), `hostname, port, parent` (self-FK SET_NULL — monitor tree, `type='group'`; active = self && semua ancestor), `maxretries def 0, retry_interval def 0, resend_interval def 0` (re-notify tiap N beat DOWN, via `down_count`), `expiry_notification` (TLS cert), `conditions JSON`.
- HTTP: `headers/body/http_body_encoding/accepted_statuscodes_json def ["200-299"]/maxredirects def 10`, auth `basic|bearer|ntlm|oauth2-cc|mtls|none` (+oauth fields, `bearer_token`, tls ca/cert/key), `cacheBust`, simpan response (`save_response`, brotli+base64 → `heartbeat.response`).
- Content check: `keyword(255)/invert_keyword`, `json_path/expected_value/jsonPathOperator`. Push: `push_token varchar(32)`. IP family, ping advanced (packet_size/count/per_request_timeout), MQTT/gRPC/RabbitMQ/SMTP/SNMP/kolom per-tipe. **`config LONGTEXT '{}'`** (kolom ekstensible, divalidasi zod `monitorConfigSchema`).
- Relasi: `proxy_id`, `docker_host`; M2M `monitor_notification`, `monitor_tag(monitor,tag,value)`, `monitor_maintenance`; group `monitor_group(monitor,group,weight,send_url,custom_url)`. Validasi: MIN_INTERVAL floor, JSON parse, rentang ping, regex nama.

### 4.2 Eksekusi check & state machine

- **Self-scheduling `setTimeout` rekursif** per monitor (bukan central ticker); beat pertama disebar acak sepanjang interval saat startup; push monitor menunggu window sebelum expiry check.
- Per beat: baca heartbeat sebelumnya (DB pertama, lalu memori) → status **UP=1, DOWN=0, PENDING=2, MAINTENANCE=3** (pre-flip bila `upsideDown`) → maintenance → 3, else dispatch per tipe (kontrak: non-UP **throw**) → update `UptimeCalculator`, `MonitorStats.recordBeat()`, emit socket, store bean, prometheus, jadwal ulang `max(1, interval*1000 − elapsed)`.
- **Retry state machine**: error → retries++ hingga `maxretries` (status tetap PENDING + `retry_interval` menggantikan interval) → DOWN. `isImportantBeat()`: `heartbeat.important=1` **hanya pada transisi status** (beat pertama, UP↔DOWN, PENDING→DOWN, edge MAINTENANCE); UP→PENDING/PENDING→UP/DOWN→DOWN tidak important — dasar partial index `WHERE important=1`. Notifikasi MAINTENANCE-edge disupresi kecuali MAINTENANCE→DOWN.

### 4.3 Uptime calculation — rolling bucket

- **Tiga tabel agregat**, `id, monitor_id CASCADE, timestamp (unix, floored), ping (avg), ping_min, ping_max, up smallint, down smallint, extras JSON`, **UNIQUE `(monitor_id, timestamp)`**:
  - `stat_minutely` (1 mnt, simpan 24 h), `stat_hourly` (1 h, 30 hari), `stat_daily` (1 hari, 365 hari).
- `update()` per beat: UP → inc up + running avg/min/max ping; DOWN → inc down; MAINTENANCE → counter terpisah; bucket berjalan di-memori, persist upsert (minutely tiap beat, hourly/daily sekali per menit), prune per jam. Uptime % = `up/(up+down)` over bucket window — **tidak scan heartbeat saat query**.
- `heartbeat`: `id, important, monitor_id CASCADE, status smallint, msg, time (ms UTC), ping ms, duration s, down_count, retries, end_time, response (brotli+base64)`. Index: `(monitor_id,time)`, `important` → **partial index `WHERE important=1`** (migration `2025-12-22-0121`). Upsert keyed `(monitor_id, timestamp)`. `toPublicJSON` menyembunyikan `msg` — pola wajib diporting ke kontrak publik Next.js.

### 4.4 Push monitor & API key

- **Push**: `router.all("/api/push/:pushToken")` — lookup `push_token` + active, params `msg, ping, status(up|down)`; `status=down` bypass retries; `determineStatus()` mereplikasi state machine PENDING/maxretries dari `previousHeartbeat.retries`; token 32 char; push monitor self-expire (tidak ada beat dalam window → DOWN + `duration` = ms sejak beat terakhir).
- **API key dua sistem**: legacy `api_key` (`key` **bcrypt hash**, format `uk<id>_<clear>`, expiry + active) dan better-auth `better_auth_apikey` (hash + prefix visible, refill/rate limit/permissions/metadata). `requireApiKey`: gate `apiEnabled`, token-bucket 60/min, Bearer/x-api-key.

### 4.5 Status page

- `status_page`: `slug unique ci, title, description, icon, theme (light|dark — sekadar CSS class), published def 1, search_engine_index, show_tags, footer_text, custom_css, show_powered_by, google_analytics_tag_id, auto_refresh_interval def 300, show_only_last_heartbeat, rss_title, analytics_id/script_url/type (google|umami|plausible|matomo|rybbit)`; domain custom `status_page_cname` (unique) + in-memory mapping untuk entry page.
- Endpoint publik: SSR `/status/:slug` (cheerio → title/meta/OG + `window.preloadData` jsesc-escaped, cache 5 mnt); `/status/:slug/rss` (RSS 2.0: incident pinned + DOWN beats); `/api/status-page/:slug` (config + incidents pinned aktif + publicGroupList, cache 5 mnt); `/api/status-page/heartbeat/:slug` (100 heartbeat terakhir per monitor publik + uptime 24 h, cache 1 mnt); `manifest.json`; `incident-history` (cursor pagination); `badge` SVG (up/degraded/down/maintenance).
- Publikasi: monitor publik ⇔ `monitor_group→group WHERE public=1 AND status_page_id`; urut group/monitor by `weight`. **Incident**: `title, content, style def warning, pin, active, status_page_id`; resolve = active+pin=false.
- **Password proteksi visitor: dinonaktifkan di fork ini** (kolom ada, pengecekan dikomentari; upstream pakai bcrypt). Target omnisight: **reimplement** dengan hash + gate cookie/endpoint. `custom_css` di-inject inline — perlu sanitasi/CSP di port Next.js (temuan risiko).

### 4.6 Notifikasi, maintenance, keamanan

- **Notification**: registry ~110 provider (`server/notification-providers/*`: Slack/Discord/Telegram/PagerDuty/Opsgenie/Webhook/SMTP/ntfy/Gotify/Pushover/Matrix/…+~60 SMS); `notification(id, name, is_default, config JSON)` + M2M `monitor_notification`; dedupe cert-expiry via `notification_sent_history(type,monitor_id,days)` UNIQUE (reset saat fingerprint cert berubah).
- **Maintenance**: strategi `manual, single, recurring-interval, recurring-weekday, recurring-day-of-month, cron`; timeslot generation table `maintenance_timeslot(generated_next)`; `isUnderMaintenance()` dicek per beat rekursif naik parent chain; M2M `monitor_maintenance` & `maintenance_status_page`.
- **Auth**: better-auth (scrypt, email+password, username plugin, TOTP 2FA `better_auth_twoFactor` + lockout, HIBP, admin plugin, secret env `UPTIME_KUMA_AUTH_SECRET`, rate limit 10/60s); legacy user table bcryptjs cost 10 + transisi SHA1→bcrypt transparan; socket handshake cookie → `socket.userID` per room user/monitor, setiap event admin di-guard `checkLogin(socket)`; failed auth selalu di-log.
- **CSP/helmet: tidak ada** — keamanan bergantung cookie httpOnly + same-origin socket + rate limit. Temuan risiko untuk port Next.js: wajib CSP strict (standar ai-site).

---

## 5. Nginx UI — Virtual Host & SSL

### 5.1 Struktur backend & routing

- Konvensi: `api/<module>/` (controller), `internal/<module>/` (logika), `model/`, `router/`, `settings/` (INI `app.ini` + env `NGINX_UI_<SECTION>_`, save atomik tmp+rename).
- Dua grup route per modul: HTTP (`AuthRequired`) dan **WebSocket** (`AuthRequiredWS` — token di header/query saja, **anti-CSWSH**, tanpa cookie). Modul: `sites` (CRUD + enable/disable/maintenance/rename/duplicate + https check WS), `certificate` (CRUD, acme_user, dns_credential/provider, issue via WS, revoke, self-signed, archive), `nginx` (build_config, **tokenize_config**, format_code, test/reload/restart, status/stub_status/directives/modules), `config` (file CRUD generik + history), `template`, `system` (stats, install, port_scan, self_check).

### 5.2 Manajemen virtual host

- **Parser**: `tufanbarisyildirim/gonginx` (`NewStringParser` skip-invalid) → AST custom `internal/nginx/parse.go`: `NgxConfig{FileName, Upstreams[], Servers[], Custom}`, `NgxServer{Directives[], Locations[]}`, `NgxUpstream`, `NgxDirective{Directive, Params, Comments, **Raw** (verbatim block/quoted)}`, `NgxLocation{Path, Content}`. `build_config.go` re-serialisasi (re-parse + dump indented) + `wrapRootBlock` http/stream.
- **Pipeline simpan** (`internal/site/save.go`, `internal/config/{save,transaction}.go`):
  1. Resolve path (nama divalidasi tolak `/\` dan `..`; `sites-available/<name>`).
  2. **Pre-validasi tokenizer** (`ValidateConfigFileWithRestricted`): termasuk include files, **restricted-directive scan** (`js_*`, `perl*`, `load_module`, `env`; opsional `allow_restricted_directives` dari client), aturan file data (.pem/.key verbatim, ekstensi source diblok).
  3. **History**: row `ConfigBackup{Name, FilePath, Content}` per perubahan konten (DB).
  4. `FileTransaction.Write` (tmp + rename 0644) → **`nginx -t`** → **rollback restore** bila gagal (snapshot/restore).
  5. Reload opsional (`post_action`), di bawah **global `config.LockApply()` mutex**.
- **Sandbox validation** (`internal/nginx/sandbox.go`): salin seluruh conf dir (kecuali `sites-*`/`streams-*`), **rewrite setiap `include`** (relatif→absolut, glob, dependensi eksternal di-hash ke `__external/`), injeksi include per-namespace ke blok http/stream, `nginx -t -c sandbox/nginx.conf`. Skip dengan alasan (`SandboxStatus/SandboxReason`) untuk namespace remote/mode non-local.
- **Enable/disable**: symlink `sites-available` → `sites-enabled` (+ helper path Windows) → test + reload dengan rollback; disable mem-pause auto-cert (`auto_cert = -2`). **Stream** analog untuk `streams-*`.
- **Control mode**: local / external_container (docker.sock) / host_via_ssh — runner `runner_local|docker|ssh.go`; target filesystem via **SFTP** (`filesystem.go` mengimplementasikan seluruh file API). Path runtime dideteksi: `nginx -V --conf-path`, `nginx -T`, probe pid.
- **Template** (`internal/template/template.go`): file dengan header TOML `# Nginx UI Template Start/End` (`ConfigInfoItem{Name, NameI18n, Variables{type string|boolean|select}, Origin builtin|plugin|custom}`), Go text/template, marker `# Nginx UI Custom Start/End` untuk split bagian custom, output di-re-parse; var injeksi `HTTPPORT, UNIXSOCKET, NGINXUIUPSTREAM, HTTP01PORT`. Katalog direktif + doc link (`nginx_directives.json`).

### 5.3 Manajemen sertifikat (lego v5)

- **`Cert`**: `Name, Domains[] json, Filename, SSLCertificatePath/KeyPath, Fingerprint (idx), AutoCert (1 aktif / −1 off / −2 paused / 2 sync / 3 self-signed), ChallengeMethod http01|dns01, DnsCredentialID, ACMEUserID, KeyType, Log, Resource (serializer json[aes]), SyncNodeIds, MustStaple, ChallengeConfig, SelfSignedConfig{IPAddresses, ValidityDays}, LastAutoRenewAt/Error, NextAutoRenewAt, Status pending|success|failure, LastError, DelegatedNodeID/ConfigName, RemoteSSLCertificatePath(s)`. Kunci identitas: `filename + key_type`.
- **`AcmeUser`**: `Name, Email, CADir (default LE), Registration (acme.Account + URI), **Key PrivateKey (ECDSA P-256, serializer json[aes])**, Proxy, EABKeyID/EABHMACKey`. Settings: `RenewalInterval` 1..90 hari (def 30), `HTTPChallengePort` def **9180**.
- **Issuance** (`internal/cert/issue.go`): per-process mutex → validasi identifier → **pre-probe loopback HTTP-01** (port tak bisa di-bind = hard error) → lego client per-user CADir + proxy → HTTP-01 `http01.NewProviderServer("", port)` / DNS-01 via **plugin provider** (`com.nginxui.dns01`, konfigurasi dari `DnsCredential.Config` terenkripsi) → `obtain` (bundle, keyType, MustStaple, Profile, ReplacesCertID) atau `renew` lego (hanya bila identifier sama & ≤21 hari) → `reloadAfterIssue()` di bawah `LockApply()` → optional reload TLS UI sendiri + revoke old.
- **Layout file**: `GetConfPath("ssl", identifiers+"_"+keyType)` (`*`→`#`, sha256-truncate >255 char); `fullchain.cer`/`private.key`; **atomic temp+rename**, cert 0644, **key 0600** (0640 eksisting dipertahankan), selalu lewat target FS (SFTP-aware). Invariant: path **harus di bawah conf dir**, bukan conf-root; renewal pin ke path eksisting (`UseExistingCertificatePaths`).
- **Auto-renew** (`internal/cron/auto_cert.go`): gocron **30 menit** + self-signed job + **6 jam** expiry-notify; `autoCert()`: skip pending/failed, **cooldown gagal 12 h**, baca cert, keputusan renew via **ARI (renewal schedule RFC)** dengan fallback `RenewalInterval` → issue in place → update status → notification + event `CertIssued` → `SyncToRemoteServer` (fan-out cluster).
- **Status issuance via WS**: `IssueCertResponse{Status, Message, SSLCertificate/Key, KeyType, Hint, Error}` streaming lego logger; bookkeeping `issue_record.go` (`PersistCertDraft`, `MarkCertFailure/Success`, `FailPendingCert`, `SweepStalePending` saat boot).
- SSL ke config: HTTPS onboarding planner (`internal/site/https_plan.go`) membangun blok `listen 443 ssl` + `ssl_certificate(_key)` dari path `BuildFinal`, redirect HTTP→HTTPS, location `/.well-known/acme-challenge`; orchestrated via WS `sites/:name/https`.

### 5.4 Kontrol nginx & auth

- `TestConfig/Reload/Restart/StartRestart` (async `ControlOperation{ID,Action,State,ExitCode,Message}`), `TryTestAndReload` (TryLock, ctx 30 s), `commandMutex`, cache hasil terakhir. Custom `TestConfig/Reload/RestartCmd` dijalankan via `sh -c` **melalui runner** — satu-satunya permukaan shell-injection (operator-authored); semua invokasi lain fixed argv `execCommandContext`.
- **Auth**: password **bcrypt** (DefaultCost); login ban `BanIP{IP,Attempts,ExpiredAt}`; **TOTP 2FA** (`OTPSecret` blob, recovery codes json[aes], MFARequired/MFAVersion) + **passkey WebAuthn** (go-webauthn) + step-up `RequireSecureSession()` untuk endpoint mutasi (dengan step-up limit); **JWT HS256** (`JwtSecret` app.ini) dengan claims `{Name, UserID, jti 16B}` dan **`AuthToken` DB-backed** (`Token idx, ShortToken, SessionHash sha256, ExpiredAt`) — logout = delete row (revocable); node-to-node: `X-Node-Secret` (constant-time) atau HTTP message signature.
- **Enkripsi at-rest**: serializer GORM `json[aes]` = **AES-128-CFB** (key = MD5(secret)) + IV acak — dipakai untuk `AcmeUser.Key`, `Cert.Resource`, `DnsCredential.Config`, `User.RecoveryCodes`. **Catatan risiko: CFB legacy — target omnisight wajib Envelope Encryption AES-256-GCM** (standar ai-rest/ai-main).
- **Event & audit**: pub-sub `internal/event` → WS (`CertIssued/CertExpiring/SiteSaved/Enabled/Disabled/NginxReloaded/AuthLoginFailed/NodeStatusChanged`); audit middleware (redaksi field sensitif + audit restricted directive); analytics gopsutil (CPU/mem/disk/net) + WS status.

### 5.5 Database (SQLite/GORM) — model utama

`Site` (path uniqueIndex, sync_node_ids JSON, DNS record cache), `Stream`, `Config{Name, Filepath, IsDir, SyncNodeIds, SyncOverwrite}`, **`ConfigBackup`** (full-content history), `Cert`, `AcmeUser`, `DnsCredential{Config (dns.Config: Code + Credentials) terenkripsi}`, `Passkey`, `AuthToken`, `BanIP`, `Namespace`, `Node`, `Notification`, `CertDeployTarget/CertDeployment`, `AutoBackup`, `Ingress`, `AccessList`. Frontend memakai CRUD helpers + WS (`?token=`).

---

## 6. Sintesis untuk Re-engineering omnisight

1. **Skema Prisma** (P2 Hari 7, P3 Hari 8) — item wajib:
   - **DCIM/IPAM ala NetBox**: `sites/locations/regions/site_groups` (hierarki — path enumeration app-side), `racks/rack_types/reservations`, `device_types/devices`, komponen (`interfaces/console/power/ports/bays/inventory`), `cables/cable_terminations/cable_paths` (JSONB path + denormalisasi), `mac_addresses`; IPAM: `vrf/route_targets/aggregates/prefixes (cidr, _depth/_children)/ip_ranges/ip_addresses (inet)/vlans/vlan_groups (vid_ranges)/asns/fhrp/services`. Status = enum/string + konstanta Rust; FK semantics PROTECT/SET_NULL/CASCADE diterjemahkan eksplisit; **validasi overlap/assignment di Rust API** (bukan DB).
   - **Telemetry/SNMP ala LibreNMS**: `devices` (tanpa plaintext creds — FK ke vault), `device_polling_methods` (settings JSON, secret_id), `secrets`/vault Envelope Encryption, `ports` + `port_metrics` (time-series + kolom prev/delta/rate), `sensors` (divisor/multiplier/limits/state) + `state_indexes/state_translations`, `processors/mempools/storage/bgp/vlans_wireless`, `alert_rules` (builder JSON + operator map parameterized) + `alerts/alert_log` (details JSON, bukan serialized blob).
   - **Uptime ala Uptime Kuma**: `monitors` (type polymorphic + `config` Json Prisma + parent tree + retry/resend), `heartbeats` (status enum 0-3, `important` + **partial index**), **`stat_minutely/hourly/daily`** (UNIQUE `(monitor_id, timestamp)` — upsert bucket), `status_pages` (+cname, incident, group public/weight), `push` via token, `api_keys` (hashed), `maintenances` + timeslots, `notifications` (config JSON + M2M).
   - **Nginx ala Nginx UI**: `nginx_sites` (name/path/status + sync node ids), `nginx_config_backups` (full history), `certs` (domains[], autocert status, challenge, dns credential FK, key_type, status pending/success/failure, next_auto_renew), `acme_users` (key terenkripsi), `dns_credentials` (config terenkripsi), `control_operations` (async), `auth_tokens` (DB-backed revocable), `passkeys`, `login_bans`.
2. **Rust API (Wave 2, Hari 13)**:
   - Ingest telemetry parameterized (dilarang substitusi string SQL à la makro alert LibreNMS); delta/rate math mengikuti kontrak LibreNMS; metadata time-series (DS name/type/min/max/heartbeat/step) disimpan sebagai schema metadata.
   - Alert state machine port 1:1 (state/log/fault + delay/interval/mute + maintenance window) dengan SQL parameterized.
   - Nginx control plane: replikasi pipeline **validasi→history→atomic write→`nginx -t`→rollback→reload** + global apply lock + **sandbox test per-namespace** (tokenizer bisa diporting dari scanner `tokenizeNginxConfig`) + restricted-directive whitelist; semua eksekusi fixed argv (tanpa `sh -c` dari input user).
   - ACME: lego-equivalent di Rust (`acme-lib`/`acme-micro`/`instant-acme`), pre-probe HTTP-01, **ARI scheduling**, fail cooldown, atomic cert 0644/key 0600, path invariant, issuance streaming via SSE/WS.
3. **Golang agents (Hari 14)**: `network_poller` — scheduler DB-driven due-ness (pola DispatchPollingWork), modul SNMP registry (ports/sensors/processors/mempools/storage/bgp/vlans) dengan **discovery deklaratif YAML** (port konvensi LibreNMS), HC-octets preference + delta/rate, kredensial dari vault blob terenkripsi; `infra_control` — nginx file ops (SFTP/fs), test/reload, cert renewal job (30 mnt tick + ARI), event publish.
4. **Next.js UI (Hari 15)**: NOC dashboard (status page + uptime bucket + heartbeat strip), Nginx config editor (AST round-trip, raw verbatim preservation), cert issuance wizard (streaming status); **wajib CSP strict + sanitasi custom_css** (temuan risiko Uptime Kuma), publik JSON selalu strip `msg`/secret (`toPublicJSON`).
5. **Risiko/temuan yang diperbaiki di target**:
   - Makro alert LibreNMS = SQLi by design → parameterized.
   - `alert_log.details` serialized PHP → JSON.
   - AES-128-CFB + key MD5 (Nginx UI) → **Envelope Encryption AES-256-GCM**.
   - Password proteksi status page nonaktif (fork) → reimplement hash + gate.
   - Tanpa CSP/helmet (Uptime Kuma) → CSP strict Next.js.
   - `custom TestConfigCmd` shell strings → eliminasi di target (fixed argv saja).
   - Uniqueness IPAM/CF app-level → reimplement dengan transaksi + `SELECT … FOR UPDATE` / partial unique index bila memungkinkan.

---

## 7. Verifikasi & Isolasi

- [x] `.gitignore` root memuat `.rea_docs/` — `git check-ignore -v .rea_docs/` → `.gitignore:4` ✔
- [x] `git status --porcelain` bersih (folder clone tidak ter-track) ✔
- [x] Shallow clone `--depth 1` empat repo ke `.rea_docs/{netbox,librenms,uptime-kuma,nginx-ui}`; commit hash tercatat pada header ✔
- [x] Tidak ada `install/build/npm/composer/pip` atau eksekusi script — audit 100% statis ✔
- [ ] Cleanup `.rea_docs/` dilakukan pada Hari 21 (`SESI 5.1`) sesuai checklist finalisasi.
