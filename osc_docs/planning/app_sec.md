# Planning `SEC` — Security Operations / SIEM (ala Wazuh)

> Rencana modul **`SEC`** sebagai konsol keamanan operasional OmniSight:
> **SIEM + HIDS + FIM + SCA + vulnerability detection + incident response**
> (pengganti/penyejajar **Wazuh**), memanfaatkan agen per-VM `osc_auto/agent_vm`
> (capability **`security`**). Bagian dari [Planning](README.md) · Lihat juga
> [blueprint](blueprint.md), [roadmap](roadmap.md), [checklist](checklist.md),
> serta modul terkait [VMS](app_vms.md) (VM/host), [NET](app_net.md) (response
> firewall), [OBS](app_obs.md) (metrik & notifikasi), dan `BOT` (agen/heartbeat).

## 1. Tujuan & Lingkup

Menambahkan lapisan **keamanan host & log** (bukan hanya perimeter WAF) ke
OmniSight:

- **Agent-based security** — deteksi di endpoint: **HIDS** (anomali proses/port/
  registri), **rootcheck** (rootkit), **FIM** (file integrity), **SCA**
  (benchmark CIS), **log collection**, **vulnerability detection** (CVE paket).
- **SIEM** — pengumpulan log terpusat, **decoder**, **rule** korelasi, alert
  keamanan, penandaan **MITRE ATT&CK**.
- **Sumber log luar** — selain agen host, terima **log `WEB`** (nginx access/
  error) dan **syslog `NET`** (MikroTik) lewat receiver terkonfigurasi
  (`sec_log_source`), lalu di-decode/rule seperti event biasa.
- **Incident & response** — kumpulkan alert menjadi **incident**, jalankan
  **active response** (host-level; blok IP via `NET` menyusul).
- **Compliance** — laporan kepatuhan (CIS/PCI-DSS/GDPR/ISO 27001) dari data SCA.
- **Agentless (opsional)** — tarik log FIM/vuln host via SSH untuk host tanpa
  agen.
- **Manajemen agen** — **upgrade agen jarak jauh** + pelaporan versi.
- **Feed ruleset** — perbarui **ruleset/decoder bawaan** dari feed (jadwal
  `JMS`), plus impor rule kustom.
- **Threat intel** — pengayaan **IOC** (VirusTotal/MISP) pada alert & kerentanan.
- **Log forwarding** — teruskan event terpilih ke **syslog/webhook** eksternal.
- **Syscollector / inventaris sistem** ★ **MAJOR** — inventaris persisten per
  agen: hardware, OS, paket, interface jaringan/alamat/protokol, port, proses,
  user/grup, service, hotfix, ekstensi browser (`sec_syscollector_*`);
  **fondasi deteksi kerentanan** & kueri IR.
- **Rule DSL lanjutan** ★ **MAJOR** — di luar `match` tunggal: `<if_sid>`,
  rule komposit/anak, `frequency`/`timeframe`, `same_field`/`different_field`/
  `same_source_ip`, lookup **CDB list**, **PCRE2**, negasi, dan grup rule.
- **CDB lists** — daftar `key:value` konstan (hash/IP/domain/user) yang dapat
  dipakai rule sebagai lookup (`sec_cdb_list` + `sec_cdb_entry`).
- **Malware detection** — pemindaian **YARA** pada FIM, integrasi **ClamAV**,
  ingest log **Windows Defender**, dan rule IOC malware kustom.
- **Vulnerability feed** — feed provider (NVD/vendor OVAL), repo **offline**,
  re-evaluasi saat content-update, pencocokan CVE berbasis **rentang versi**
  (`sec_vuln_feed` + jadwal `JMS`).
- **Container runtime** — listener **Docker Engine events** (privileged/exec/
  volume/image) + rule container.
- **Osquery** — osquery terkelola agen, kueri ala-SQL, rule kustom.
- **Command/Auditd & FIM who-data** — monitoring perintah + auditd dengan
  atribusi user/proses, `report_changes` (diff isi), dan monitor registry Windows.
- **Active response lanjutan** — pustaka script bawaan, timeout/**revert**
  (`delete`), lokasi `local`/`server`/`all`, dan script kustom.
- **Live query / command execution** — forensik IR jarak jauh lewat kanal WS.
- **Agent groups** — config bersama terpusat (ala `agent.conf`) + kebijakan per grup.
- **Compliance mapping** — tag `pci_dss`/`gdpr`/`hipaa`/`nist_800_53`/`tsc`
  pada rule; framework **HIPAA/NIST 800-53/TSC** ditambahkan (CIS tetap dulu).
- **Uji rule/decoder (logtest)** — simulasi sebelum deploy.
- **Windows EventChannel + Sysmon** — kanal collector Windows (menjawab §14.3).
- **Cloud security (AWS/Azure/GCP) + CSPM** — modul API-pull posture.
- **Skalabilitas horizontal** — manager/worker (LB agen, sinkron ruleset/kunci).
- **RBAC halus** — grant per agen/grup/file/node (mode black/white).
- **MITRE ATT&CK** — sub-teknik + view MITRE khusus (`SEC04`/`SEC18`).
- **Threat intel tambahan** — AlienVault OTX, URLHaus, AbuseIPDB, Maltiverse.
- **Preset alerting** — payload Slack/PagerDuty/Shuffle + filter lebih halus.
- **Kedalaman decoder** — parent/child, `offset`, decoder JSON, field dinamis.
- **Platform breadth** — macOS (ULS), Solaris, Docker, cloud log source
  (lingkup terbatas).
- **Multi-tenant** — per `company_id`, RBAC OmniSight.

> **WAF tetap terpisah.** Tabel perimeter `sec_waf_rule`/`sec_waf_event` (modul
> `WAF`) tetap; modul **`SEC`** menambah sub-domain **SIEM/HIDS/XDR** pada cluster
> `sec_*` yang sama (lihat §6).

## 2. Paritas Fitur dengan Wazuh

| Fitur Wazuh | Target `SEC` | Catatan |
|---|---|---|
| Agent ringan (multi-OS) | ✅ | Biner `osc_auto/agent_vm` (capability `security`), bukan paket OS terpisah. |
| Log collection + decoders | ✅ | `sec_decoder` + `sec_event`. |
| Rule engine + korelasi | ✅ | `sec_rule` (level, MITRE) → `sec_event_alert`. |
| FIM (file integrity) | ✅ | `sec_fim_event` (checksum, mode, owner). |
| HIDS / rootcheck | ✅ | `sec_event` type HIDS/ROOTCHECK. |
| SCA / CIS benchmark | ✅ | `sec_sca_policy` + `sec_sca_result`. |
| Vulnerability detection (CVE) | ✅ | `sec_vuln` (host/VM); gambar container tetap di `POD`. |
| Incident management | ✅ | `sec_incident` + `sec_incident_event`. |
| Active response | ⚠️ | Host-level (`KILL_PROCESS`/quarantine); **blok IP via `NET`** menyusul (auto-block ditangguhkan). |
| Compliance (PCI/GDPR/CIS/ISO) | ✅ | `sec_compliance_report` dari hasil SCA. |
| Remote agent upgrade | ✅ | `sec_agent.agent_version` + endpoint upgrade jarak jauh. |
| Ruleset/decoder feed | ✅ | `sec_rule_feed` + jadwal update via `JMS`. |
| Threat intel (VirusTotal/MISP) | ✅ | `sec_intel_feed` + pengayaan alert/vuln. |
| Log forwarding (syslog/webhook) | ✅ | `sec_forwarder` (event terpilih → tujuan luar) + preset Slack/PagerDuty/Shuffle. |
| **Syscollector / inventory** ★ MAJOR | ✅ | `sec_syscollector_*` (hardware/OS/paket/net/proses/user/service/hotfix/browser-ext); fondasi vuln. |
| **Rich rule DSL** ★ MAJOR | ✅ | `sec_rule` (if_sid, child/composite, frequency/timeframe, same/different field, CDB lookup, PCRE2, negasi, grup). |
| CDB lists | ✅ | `sec_cdb_list` + `sec_cdb_entry` (lookup rule). |
| Malware detection | ✅ | YARA (FIM) + ClamAV + Windows Defender + rule IOC malware. |
| Vulnerability feed management | ✅ | `sec_vuln_feed` (NVD/OVAL, offline, re-evaluasi, rentang versi). |
| Docker/container runtime listener | ✅ | Listener Docker Engine events → `sec_container_event`. |
| Osquery integration | ✅ | Osquery terkelola agen + kueri SQL → `sec_osquery_query`. |
| Command/auditd + FIM who-data | ✅ | Auditd + atribusi user/proses, `report_changes`, registry Windows. |
| Active-response depth | ✅ | Script registry, timeout/revert (`delete`), lokasi local/server/all. |
| Remote live queries | ✅ | Kanal WS → `sec_live_query` (forensik IR). |
| Agent groups (centralized config) | ✅ | `sec_agent_group` + push config bersama. |
| Rule/alert compliance mappings | ✅ | Array `pci_dss`/`gdpr`/`hipaa`/`nist_800_53`/`tsc` pada rule. |
| wazuh-logtest | ✅ | Endpoint uji rule/decoder sebelum deploy. |
| Windows EventChannel + Sysmon | ✅ | Collector kanal Windows (`sec_log_source`). |
| Cloud security + CSPM | ✅ | AWS/Azure/GCP API-pull (`sec_cloud_account`/`sec_cloud_finding`). |
| Horizontal scaling | ⚠️ | Manager/worker direncanakan (LB agen + sinkron ruleset/kunci). |
| Fine-grained RBAC | ⚠️ | Grant per agen/grup/file/node (mode black/white). |
| MITRE sub-techniques + view | ✅ | `mitre_subtechnique` + view `SEC18`. |
| Threat intel tambahan | ✅ | OTX/URLHaus/AbuseIPDB/Maltiverse pada `sec_intel_feed`. |
| Decoder depth | ✅ | Parent/child, `offset`, decoder JSON, field dinamis. |
| Platform breadth (macOS/Solaris/Docker/cloud) | ⚠️ | Lingkup terbatas; Windows/Sysmon & Docker diprioritaskan. |
| Cloud/container (image scan) | ✅ | Container runtime listener + cloud CSPM; scan image tetap di `POD` (Trivy). |
| Indexer/OpenSearch bawaan | ❌ | Pakai PostgreSQL (tanpa OpenSearch). |
| Dashboard visual bawaan | ✅ | Halaman `SEC01`.. ala OmniSight. |

**Referensi alat**: Wazuh (Manager/Agent/Indexer/Dashboard), OSSEC.

## 3. Keputusan Arsitektur (draft — perlu konfirmasi §14)

1. **Kode modul:** `SEC` (**Security Operations/SIEM**) — halaman `SEC01`..;
   `WAF` tetap modul perimeter dengan cluster `sec_waf_*`.
2. **Cluster DB:** `sec_*` (lanjutan `cluster_sec.prisma`; WAF + SIEM satu cluster).
3. **Agen:** capability **`security`** pada `osc_auto/agent_vm` (satu biner, banyak
   kemampuan: `engine`, `metrics`, `vmhost`, `security`). **Agen tidak mengakses
   DB** — semua lewat grup `/rest/agent` (`USBots()`, token `bot_agent` + mTLS).
4. **Kanal data:** **push** agen→hub (batch event + WS kanal perintah/active
   response), tanpa expose port publik. Mode **agentless** (SSH-pull) opsional.
5. **Penyimpanan:** PostgreSQL — `sec_event` telemetry beretensi + rollup;
   rule/decoder/incident persisten; tanpa OpenSearch/Elasticsearch.
6. **Rule & decoder:** muat **ruleset bawaan** (subset Wazuh) yang bisa diimpor;
   dukung rule/decoder **kustom**. Pencocokan di kernel SIEM `osc_rest`.
7. **Active response:** host-level dulu (`KILL_PROCESS`, karantina, kunci user);
   **blok IP** memakai `NET` (`address-list`) saat fitur itu diaktifkan kembali.
8. **Vulnerability:** deteksi berbasis **paket** (inventaris paket + umpan CVE),
   menyatu dengan `vms_finding`.
9. **Enrollment:** kunci pendaftaran per company (`enrollment` token), agen
   mendaftar ke `bot_agent` + `sec_agent`.
10. ★ **MAJOR — Syscollector:** inventaris sistem persisten per agen
    (`sec_syscollector_*`) sebagai **fondasi vulnerability detection** (paket →
    CVE) dan kueri IR; disinkronkan berkala via collector agen.
11. ★ **MAJOR — Rule DSL:** `sec_rule` mendukung `<if_sid>`/parent-child,
    komposit, `frequency`/`timeframe`, `same_field`/`different_field`/
    `same_source_ip`, lookup CDB, **PCRE2**, negasi, dan grup rule; pencocokan
    di kernel SIEM `osc_rest`.
12. **CDB lists:** daftar `key:value` generik (`sec_cdb_list`/`sec_cdb_entry`)
    untuk lookup password/hash/IP/domain/user pada rule.
13. **Malware:** **YARA** di alur FIM + **ClamAV** + ingest **Windows Defender**
    + rule IOC malware kustom (`sec_malware_event`).
14. **Vuln feed:** `sec_vuln_feed` (NVD/vendor OVAL), repo **offline**,
    re-evaluasi saat content-update, matching **rentang versi**; jadwal `JMS`.
15. **Container runtime:** listener **Docker Engine events** → `sec_container_event`
    (privileged/exec/volume/image) + rule.
16. **Osquery:** osquery terkelola agen (kueri SQL) → `sec_osquery_query`/`sec_event`.
17. **Command/auditd & who-data:** auditd + atribusi user/proses, `report_changes`
    (diff isi), dan registry Windows pada `sec_fim_event`.
18. **Active response lanjutan:** **script registry** (`sec_response_script`),
    timeout/revert (`delete`), `location` (`local`/`server`/`all`), script kustom.
19. **Live query:** eksekusi perintah/kueri forensik jarak jauh via kanal WS
    (`sec_live_query`); audit + batas allowlist.
20. **Agent groups:** konfigurasi bersama terpusat (ala `agent.conf`) per grup
    (`sec_agent_group`) + kebijakan berlingkup grup.
21. **Compliance mapping:** array `pci_dss`/`gdpr`/`hipaa`/`nist_800_53`/`tsc`
    pada rule; **CIS tetap prioritas**.
22. **Logtest:** endpoint uji/simulasi rule & decoder sebelum deploy.
23. **Windows EventChannel + Sysmon:** collector kanal Windows ditambahkan
    (menjawab pertanyaan §14.3).
24. **Cloud security:** modul API-pull **AWS/Azure/GCP** + **CSPM**
    (`sec_cloud_account`/`sec_cloud_finding`).
25. **Skalabilitas horizontal:** manager/worker direncanakan — LB agen +
    sinkronisasi ruleset/kunci (bukan single manager).
26. **RBAC halus:** grant berlingkup agen/grup/file/node (mode black/white),
    melampaui RBAC level-modul.
27. **Platform breadth:** macOS (ULS), Solaris, Docker, cloud log source dalam
    lingkup terbatas (dicatat, bukan prioritas awal).

## 4. Arsitektur & Topologi

```
agent_vm (osc_auto, capability security) ──WS/HTTP──► osc_rest (/rest/agent/sec/*) ──► Postgres sec_*
        │  collector: FIM · rootcheck · SCA · log · paket/CVE
        │  + kanal perintah (active response)
        └── push batch event + heartbeat

osc_site (SEC01..) ──/proxy/pages/SEC/*──► osc_rest (rule engine + korelasi)
                                              └── alert ──► obs_notification ──► email/webhook
                                              └── incident + active response ──► agent_vm
osc_rest ──► NET (blok IP, opsional) · VMS (host/guest) · POD (event container)
```

- **Manager = `osc_rest`** (rule/decoder/korelasi/persistensi); **agen = kolektor**.
- **Backend = penghubung tunggal ke DB**; agen tidak pernah akses DB.
- **Notifikasi** reuse `OBS` (`obs_notification`) via evaluator `SEC`.

## 5. Sumber Data Keamanan

| Domain | Sumber | Catatan |
|---|---|---|
| Log sistem & aplikasi | `journald`/`syslog`, file log, event Windows (opsional) | Collector agen. |
| Web server | `WEB` — nginx access/error log | Forward via agen `web`/file; `sec_log_source`. |
| Perangkat jaringan | `NET` — syslog MikroTik (`net_syslog_event`) | Receiver syslog → decode. |
| FIM | Inotify/watch + baseline checksum | `sec_fim_event`. |
| Rootcheck/HIDS | Pemindaian berkala proses/port/registri | `sec_event`. |
| SCA | Skrip benchmark CIS (YAML) | `sec_sca_policy`/`sec_sca_result`. |
| Vulnerability | Inventaris paket (`dpkg`/`rpm`/`apk`) vs CVE | `sec_vuln`. |
| Network/firewall | `NET` (`net_firewall_event`) | Korelasi &. |
| Container | `POD` (`pod_scan_finding`) + **Docker Engine events** | Referensi temuan image + `sec_container_event`. |
| Syscollector/inventaris | Agen: `dpkg`/`rpm`/`apk`, `/proc`, sysfs, registry, Docker API | `sec_syscollector_*`. |
| Malware | **YARA** (FIM), **ClamAV**, log **Windows Defender** | `sec_malware_event`. |
| Command/auditd | `auditd`, command shell, registry Windows | Atribusi user/proses, `report_changes`. |
| Windows | **EventChannel** + **Sysmon** | Collector kanal Windows (opsional/fase lanjutan). |
| Osquery | Osquery terkelola agen (kueri SQL) | `sec_osquery_query`. |
| Cloud | **AWS/Azure/GCP** (API-pull) | `sec_cloud_account`/`sec_cloud_finding` (CSPM). |
| Platform lain | macOS **ULS**, Solaris, log cloud | Lingkup terbatas (fase lanjutan). |

## 6. Model Database — cluster `sec_*` (lanjutan)

### 6.1 Sudah ada (perimeter/WAF)

| Model | Isi |
|---|---|
| `sec_waf_rule` | Aturan WAF (CUSTOM/SQLI/XSS/RCE/RATE_LIMIT), aksi, prioritas. |
| `sec_waf_event` | Event blokir WAF (telemetry beretensi). |

### 6.2 Baru (SIEM/HIDS/XDR)

| Model | Isi pokok | Kunci |
|---|---|---|
| `sec_agent` | Agen keamanan: `code`, `name`, `agent_id`? (→ `bot_agent`), `host_ref`?, `os`, `arch`, `agent_version`, `upgrade_available` (Bool), `mode` (AGENT/AGENTLESS), `group`, `policy_id`?, `status` (ACTIVE/PENDING/DISCONNECTED), `last_seen`, `is_active` | `@@unique([company_id, code])` |
| `sec_decoder` | Dekoder log: `name`, `program_name`, `prematch`, `regex`, `order` (JSON), `parent_id`? (decoder anak), `offset`? (PCRE), `is_json` (Bool), `dynamic_fields` (Json), `is_active`, `source` (BUILTIN/CUSTOM) | `@@unique([company_id, name])` |
| `sec_log_source` | Sumber log luar: `name`, `type` (AGENT/SYSLOG/API/FILE), `host`?, `port`?, `program`?, `decoder_id`?, `web_server_id`? (→ `web_server`)/`net_device_id`? (→ `net_device`), `is_active` | `@@unique([company_id, name])` |
| `sec_rule` | Aturan deteksi (DSL lanjutan, ★ MAJOR): `code`, `name`, `category` (SIEM/FIM/HIDS/ROOTCHECK/SCA/COMPLIANCE/MALWARE/CONTAINER/CLOUD/OSQUERY), `level` (0..15), `decoder`, `parent_id`? (child/composite), `if_sid` (Json), `if_group`, `match`?, `regex`? (**PCRE2**), `offset`?, `negate` (Bool), `frequency`?, `timeframe`?, `same_field`?, `different_field`?, `same_source_ip`?, `list_ref`? (→ `sec_cdb_list`), `rule_group`, `severity`, `mitre_tactic`, `mitre_technique`, `mitre_subtechnique`?, `compliance_pci_dss` (Json), `compliance_gdpr` (Json), `compliance_hipaa` (Json), `compliance_nist_800_53` (Json), `compliance_tsc` (Json), `is_active`, `source` | `@@unique([company_id, code])` |
| `sec_event` | Event keamanan (telemetry): `agent_id`, `rule_id`?, `type`, `level`, `severity`, `src_ip`, `dst_ip`, `user_name`, `process`, `file`, `command`, `message`, `mitre_tactic`, `mitre_technique`, `raw` (Json), `occurred_at` | indeks `[company_id, occurred_at]`, `[agent_id, occurred_at]` |
| `sec_event_alert` | Alert terkorelasi: `rule_id`, `agent_id`?, `title`, `level`, `severity`, `count`, `first_seen`, `last_seen`, `status` (OPEN/ACK/RESOLVED/IGNORED), `incident_id`? | indeks `[company_id, status]` |
| `sec_fim_event` | FIM (dengan **who-data**): `agent_id`, `path`, `event_type` (ADDED/MODIFIED/DELETED), `checksum_before`, `checksum_after`, `size_bytes`, `mode`, `owner`, `user_name`? (atribusi), `process_name`?, `process_id`?, `audit_uid`?, `report_changes` (Json diff isi), `registry_key`? (Windows Registry), `occurred_at` | indeks `[agent_id, occurred_at]` |
| `sec_sca_policy` | Kebijakan SCA: `code`, `name`, `benchmark` (CIS/…), `platform`, `content` (TEXT/YAML), `is_active` | `@@unique([company_id, code])` |
| `sec_sca_result` | Hasil SCA: `agent_id`, `policy_id`, `check_id`, `title`, `result` (PASS/FAIL/NA), `severity`, `remediation`, `scanned_at` | indeks `[agent_id, policy_id]` |
| `sec_vuln` | Kerentanan host/VM: `agent_id`, `host_ref`?, `guest_ref`?, `cve`, `pkg`, `installed_version`, `fixed_version`, `severity`, `cvss`, `status` (OPEN/ACK/RESOLVED), `detected_at`, `resolved_at` | indeks `[company_id, severity]` |
| `sec_incident` | Insiden/kasus: `code`, `title`, `severity`, `status` (OPEN/INVESTIGATING/CONTAINED/RESOLVED/CLOSED), `assignee_id`?, `description`, `opened_at`, `closed_at` | `@@unique([company_id, code])` |
| `sec_incident_event` | Tautan alert/event → insiden: `incident_id`, `event_type` (ALERT/EVENT/FIM/VULN), `event_ref`, `added_at` | indeks `[incident_id]` |
| `sec_response_action` | Active response (★ lanjutan): `agent_id`, `action` (KILL_PROCESS/QUARANTINE/DISABLE_USER/BLOCK_IP/CUSTOM), `script_id`? (→ `sec_response_script`), `target`, `location` (LOCAL/SERVER/ALL), `timeout`? (detik), `revert` (Bool), `reverted_at`?, `status`, `result`, `trigger_alert_id`?, `executed_by`?, `executed_at` | indeks `[company_id, executed_at]` |
| `sec_compliance_report` | Laporan kepatuhan: `framework` (CIS/PCI/GDPR/ISO27001), `period`, `score`, `content` (Json/PDF path), `generated_at`, `generated_by` | indeks `[company_id, framework]` |
| `sec_rule_feed` | Sumber ruleset/decoder: `name`, `kind` (RULESET/DECODER), `url`, `version`, `last_synced_at`, `auto_update` (Bool), `is_active` | `@@unique([company_id, name])` |
| `sec_intel_feed` | Sumber threat intel (IOC): `name`, `provider` (VIRUSTOTAL/MISP/ALIENVAULT_OTX/URLHAUS/ABUSEIPDB/MALTIVERSE/CUSTOM), `type` (IP/DOMAIN/HASH/URL), `endpoint`?, `api_key_enc`?, `auto_enrich` (Bool), `is_active` | `@@unique([company_id, name])` |
| `sec_intel_ioc` | IOC ter-cache: `feed_id`, `indicator`, `type`, `severity`?, `source`?, `expires_at`, `last_seen` | indeks `[company_id, indicator]` |
| `sec_forwarder` | Penerusan log: `name`, `type` (SYSLOG/WEBHOOK), `preset` (CUSTOM/SLACK/PAGERDUTY/SHUFFLE), `endpoint`, `format` (JSON/CEF/RAW), `min_level`, `filter` (Json), `field_filters` (Json, halus), `is_active` | `@@unique([company_id, name])` |
| `sec_agent_group` | Grup agen + config bersama (ala `agent.conf`): `code`, `name`, `agent_conf` (TEXT/YAML), `policy_id`?, `is_active` | `@@unique([company_id, code])` |
| `sec_cdb_list` | Daftar CDB: `name`, `file_path`?, `checksum`?, `entries_count`, `is_active` | `@@unique([company_id, name])` |
| `sec_cdb_entry` | Entri CDB: `list_id`, `key`, `value`? (JSON/TEXT) | indeks `[list_id, key]` |
| `sec_malware_event` | Malware: `agent_id`, `scanner` (YARA/CLAMAV/DEFENDER), `path`?, `signature`?, `hash`?, `severity`, `action` (DETECTED/QUARANTINED/…), `raw` (Json), `occurred_at` | indeks `[company_id, occurred_at]` |
| `sec_vuln_feed` | Feed CVE: `name`, `provider` (NVD/VENDOR_OVAL/CUSTOM), `version`?, `url`?, `offline_path`?, `last_synced_at`, `auto_update` (Bool), `is_active` | `@@unique([company_id, name])` |
| `sec_container_event` | Event Docker Engine: `agent_id`, `container_id`, `event` (START/EXEC/PRIVILEGED/VOLUME/IMAGE/…), `image`?, `user`?, `message`, `raw` (Json), `occurred_at` | indeks `[company_id, occurred_at]` |
| `sec_osquery_query` | Kueri osquery: `name`, `sql`, `schedule`?, `interval`?, `agent_group`?, `is_active` | `@@unique([company_id, name])` |
| `sec_live_query` | Live query/command IR: `agent_id`, `kind` (QUERY/COMMAND), `payload`, `timeout`?, `status`, `result` (Json), `requested_by`?, `executed_at` | indeks `[company_id, status]` |
| `sec_response_script` | Registry script active response: `name`, `os`?, `executable` (TEXT/BLOB path), `default` (Bool), `checksum`?, `is_active` | `@@unique([company_id, name])` |
| `sec_rbac_grant` | RBAC halus: `subject` (USER/ROLE), `scope` (AGENT/GROUP/FILE/NODE), `scope_ref`?, `mode` (BLACK/WHITE), `actions` (Json) | indeks `[company_id, scope]` |
| `sec_cloud_account` | Akun cloud: `provider` (AWS/AZURE/GCP), `name`, `credential_enc`?, `region`?, `is_active` | `@@unique([company_id, name])` |
| `sec_cloud_finding` | Temuan CSPM: `account_id`, `check_id`, `title`, `resource`, `severity`, `status` (OPEN/ACK/RESOLVED), `occurred_at` | indeks `[company_id, severity]` |

### 6.3 Syscollector — Inventaris Sistem ★ MAJOR

Inventaris persisten per agen (`sec_syscollector_*`), **fondasi vulnerability
detection** (paket → CVE) dan kueri IR. Sub-tabel: `sec_syscollector_hardware`,
`_os`, `_package`, `_iface` (interface/alamat IP), `_port` (protokol/port),
`_process`, `_user`, `_group`, `_service`, `_hotfix`, `_browser_ext`. Semua
berkunci `agent_id` (+ `company_id`) dengan indeks waktu sinkronisasi.

### 6.4 Rule DSL Lanjutan ★ MAJOR

`sec_rule` diperluas: `parent_id` (child/composite), `if_sid`/`if_group`,
`match`/`regex` (**PCRE2**), `negate`, `frequency`/`timeframe`,
`same_field`/`different_field`/`same_source_ip`, `list_ref` → `sec_cdb_list`,
`rule_group`, serta array compliance (`compliance_*`). `sec_decoder` diperluas:
`parent_id`, `offset`, `is_json`, `dynamic_fields`.

Relasi inti:

```text
sec_agent (1) ──► (N) sec_event · sec_fim_event · sec_sca_result · sec_vuln
sec_rule (1) ──► (N) sec_event_alert ──► (N) sec_incident_event ──► sec_incident
sec_decoder (1) ──► (N) sec_event
sec_log_source ──► sec_decoder   sec_log_source ── web_server (WEB) / net_device (NET)
sec_sca_policy (1) ──► (N) sec_sca_result
sec_incident (1) ──► (N) sec_incident_event
sec_response_action ──trigger──► sec_event_alert
sec_rule_feed ──(sync)──► sec_rule / sec_decoder
sec_intel_feed (1) ──► (N) sec_intel_ioc ──(enrich)──► sec_event_alert / sec_vuln
sec_forwarder ──(forward)──► sec_event_alert / sec_event
sec_rule.list_ref ──► sec_cdb_list (1) ──► (N) sec_cdb_entry
sec_agent_group (1) ──► (N) sec_agent
sec_response_script (1) ──► (N) sec_response_action
sec_vuln_feed ──(match)──► sec_vuln   sec_syscollector_package ──(feed)──► sec_vuln
sec_malware_event / sec_container_event / sec_cloud_finding / sec_live_query ──► sec_agent
sec_rbac_grant ──(grant)──► sec_agent / sec_agent_group / file / node
sec_agent.agent_id ──► bot_agent (BOT)   WAF: sec_waf_rule ──► sec_waf_event
```

> `sec_event`/`sec_fim_event`/`sec_malware_event`/`sec_container_event`/
> `sec_live_query` = telemetry beretensi (lihat §9). Rule/decoder/CDB/policy/
> feed/agent_group/response_script/incident/laporan = persisten.
> Inventory `sec_syscollector_*` = persisten (snapshot terbaru + histori paket).

## 7. Backend (osc_rest) & Agen

Struktur: `osc_rest/skeleton/sec/` (`sec_handler.go`, `sec_usecase.go`,
`sec_repository.go`, `sec_template.go`) + `mechanic/siem/` (rule engine,
decoder, korelasi) + agen di **`osc_auto/agent_vm`** (capability `security`).

### 7.1 Endpoint UI (grup `admin`, `USAuth(), USLock()`, mutasi `USRole("SEC", level)`)

| Area | Endpoint |
|---|---|
| Dashboard | `GET /rest/pages/SEC/overview` (postur, alert, insiden, skor SCA) |
| Agen | `GET/POST /SEC/agents`, `GET/PUT/DELETE /SEC/agents/:id`, `POST /SEC/agents/:id/ping`, `POST /SEC/agents/:id/enroll`, `POST /SEC/agents/:id/upgrade` |
| Ruleset feed | `GET/POST /SEC/rule-feeds`, `POST /SEC/rule-feeds/:id/sync`, `POST /SEC/rules/update` |
| Threat intel | `GET/POST /SEC/intel-feeds`, `POST /SEC/intel-feeds/:id/sync`, `POST /SEC/intel/enrich` |
| Forwarder | `GET/POST /SEC/forwarders`, `PUT/DELETE /SEC/forwarders/:id`, `POST /SEC/forwarders/:id/test` |
| Event | `GET /SEC/events`, `GET /SEC/events/:id` |
| Alert | `GET /SEC/alerts`, `POST /SEC/alerts/:id/ack\|resolve\|ignore`, `POST /SEC/alerts/:id/to-incident` |
| Rule/Decoder | `GET/POST /SEC/rules`, `PUT/DELETE /SEC/rules/:id`, `GET/POST /SEC/decoders`, `PUT/DELETE /SEC/decoders/:id`, `POST /SEC/rules/import`, `POST /SEC/logtest` (uji rule/decoder) |
| CDB list | `GET/POST /SEC/cdb-lists`, `PUT/DELETE /SEC/cdb-lists/:id`, `GET/POST /SEC/cdb-lists/:id/entries` |
| Log source | `GET/POST /SEC/log-sources`, `PUT/DELETE /SEC/log-sources/:id`, `POST /SEC/log-sources/:id/test` |
| FIM | `GET /SEC/fim`, `GET /SEC/fim/summary`, `GET /SEC/fim/:id/diff` (report_changes) |
| Inventory (Syscollector) ★ | `GET /SEC/inventory`, `GET /SEC/inventory/:agentId`, `GET /SEC/inventory/:agentId/packages\|ports\|processes\|users` |
| SCA | `GET/POST /SEC/sca/policies`, `PUT/DELETE /SEC/sca/policies/:id`, `GET /SEC/sca/results`, `POST /SEC/sca/scan` |
| Vulnerability | `GET /SEC/vulns`, `POST /SEC/vulns/:id/ack\|resolve`, `POST /SEC/vulns/scan`, `GET/POST /SEC/vuln-feeds`, `POST /SEC/vuln-feeds/:id/sync` |
| Malware | `GET /SEC/malware`, `POST /SEC/malware/rules` (IOC kustom), `POST /SEC/malware/scan` |
| Container | `GET /SEC/containers/events`, `GET /SEC/containers/rules` |
| Osquery | `GET/POST /SEC/osquery/queries`, `PUT/DELETE /SEC/osquery/queries/:id`, `POST /SEC/osquery/run` |
| Live query | `POST /SEC/agents/:id/live-query`, `GET /SEC/live-queries`, `GET /SEC/live-queries/:id` |
| Agent groups | `GET/POST /SEC/agent-groups`, `GET/PUT/DELETE /SEC/agent-groups/:id`, `POST /SEC/agent-groups/:id/push` |
| Response scripts | `GET/POST /SEC/response-scripts`, `PUT/DELETE /SEC/response-scripts/:id` |
| Cloud & CSPM | `GET/POST /SEC/cloud/accounts`, `POST /SEC/cloud/accounts/:id/sync`, `GET /SEC/cloud/findings` |
| RBAC | `GET/POST /SEC/rbac/grants`, `DELETE /SEC/rbac/grants/:id` |
| MITRE | `GET /SEC/mitre/coverage` |
| Incident | `GET/POST /SEC/incidents`, `GET/PUT /SEC/incidents/:id`, `POST /SEC/incidents/:id/event`, `POST /SEC/incidents/:id/close` |
| Response | `POST /SEC/agents/:id/response` (active response), `GET /SEC/responses`, `POST /SEC/responses/:id/revert` |
| Compliance | `GET/POST /SEC/compliance/reports`, `GET /SEC/compliance/reports/:id`, `GET /SEC/compliance/reports/:id/download` |
| Settings | `GET/PUT /SEC/settings` (level minimum, retensi, enrollment) |

### 7.2 Endpoint agen (`/rest/agent`, `USBots()`, token `bot_agent` + mTLS)

| Endpoint agen | Fungsi |
|---|---|
| `POST /rest/agent/sec/register` | Enrollment/klaim agen → `bot_agent` + `sec_agent`. |
| `POST /rest/agent/sec/ingest` | Batch event/log (`sec_event`) via rule engine. |
| `POST /rest/agent/sec/log` | Forward log file (mis. nginx `WEB`) via `sec_log_source`. |
| `POST /rest/agent/sec/fim` | Kirim event FIM (`sec_fim_event`). |
| `POST /rest/agent/sec/sca` | Kirim hasil SCA (`sec_sca_result`). |
| `POST /rest/agent/sec/vuln` | Kirim hasil deteksi kerentanan (`sec_vuln`). |
| `POST /rest/agent/sec/syscollector` | Kirim inventaris sistem (`sec_syscollector_*`) ★. |
| `POST /rest/agent/sec/malware` | Kirim temuan malware/YARA/ClamAV/Defender (`sec_malware_event`). |
| `POST /rest/agent/sec/audit` | Kirim event command/auditd + FIM who-data (`sec_event`/`sec_fim_event`). |
| `POST /rest/agent/sec/container` | Kirim event Docker Engine (`sec_container_event`). |
| `POST /rest/agent/sec/osquery` | Kirim hasil kueri osquery (`sec_osquery_query` → `sec_event`). |
| `GET  /rest/agent/sec/ws` | Kanal perintah (konfigurasi/grup + active response + **live query** + **upgrade agen**). |
| `GET  /rest/agent/sec/config` | Ambil config bersama grup (`sec_agent_group.agent_conf`). |
| `POST /rest/agent/sec/heartbeat` | Denyut + status (`bot_heartbeat`, `sec_agent.last_seen`). |

> Semua lewat grup `/rest/agent` (`USBots()`); agen **tidak** mengakses DB.
> Active response dikembalikan lewat kanal WS/klaim (request dari UI).

### 7.3 Rule engine & korelasi
- **Log source** (`sec_log_source`): receiver syslog (`NET`), forward file
  nginx (`WEB`), **EventChannel+Sysmon (Windows)**, **Docker events**, batch
  agen, dan **API-pull cloud** — semuanya masuk pipeline yang sama.
- **Decoder depth**: decoder mencocokkan log → field terstruktur → rule;
  mendukung **parent/child decoder**, `offset`, **decoder JSON**, dan field
  dinamis. Rule DSL lanjutan (★): `if_sid`/child/composite, `frequency`/
  `timeframe`, `same_field`/`different_field`/`same_source_ip`, **lookup CDB**
  (`list_ref`), **PCRE2**, negasi, dan grup rule.
- Korelasi (frekuensi/agregasi) → `sec_event_alert`; eskalasi ke `sec_incident`.
- Alert berlevel tinggi → `obs_notification` (email/webhook/…), reuse OBS.
- **Logtest**: uji/simulasi rule & decoder pada log contoh sebelum deploy.
- **Syscollector → vulnerability** (★): inventaris paket agen dipetakan ke
  `sec_vuln_feed` (NVD/OVAL, **rentang versi**), re-evaluasi saat content-update,
  termasuk repo **offline**.
- **Feed ruleset** (`sec_rule_feed`): sinkron berkala (via `JMS`) → merge
  `sec_rule`/`sec_decoder` (bawaan + kustom).
- **Threat intel** (`sec_intel_feed`/`sec_intel_ioc`): pengayaan IOC pada alert &
  kerentanan (VirusTotal/MISP/**OTX/URLHaus/AbuseIPDB/Maltiverse**).
- **Malware**: YARA pada alur FIM + ClamAV + ingest Defender → `sec_malware_event`
  + rule IOC.
- **Container listener**: event Docker Engine (privileged/exec/volume/image) →
  `sec_container_event` → rule container.
- **Osquery**: kueri SQL terjadwal agen → `sec_event` + rule kustom.
- **Auditd/command & who-data**: atribusi user/proses + `report_changes` (diff)
  + registry Windows pada `sec_fim_event`.
- **Active response lanjutan**: skrip dari `sec_response_script`, `location`
  (`local`/`server`/`all`), timeout + **revert** (`delete`).
- **Live query**: kueri/perintah IR via kanal WS → `sec_live_query` (audit).
- **Agent groups**: push `agent_conf` bersama per grup (`sec_agent_group`).
- **Cloud/CSPM**: API-pull AWS/Azure/GCP → `sec_cloud_finding`.
- **Log forwarding** (`sec_forwarder`): event terpilih → syslog/webhook eksternal
  (format JSON/CEF) dengan **preset Slack/PagerDuty/Shuffle** + `field_filters`.
- **Skalabilitas**: manager stateless + worker; agen di-LB, sinkronisasi
  ruleset/kunci antar-node (direncanakan).
- **Upgrade agen jarak jauh**: perintah via WS → agen ambil paket → lapor
  `agent_version` baru.
- Semua mutasi UI (ack, response, live query, tutup insiden) → `USLogs`
  (`app_user_action`).

## 8. Frontend (osc_site)

| Kode | Halaman |
|---|---|
| `SEC01` | **Dashboard** — postur keamanan, tren alert, insiden aktif, skor SCA |
| `SEC02` | **Agents** — daftar agen, status, versi/**upgrade**, grup/kebijakan, enroll/uji |
| `SEC03` | **Events & Alerts** — stream event, alert terkorelasi (ack/resolve → insiden) |
| `SEC04` | **Rules & Decoders** — daftar/kustom/import, **rule DSL lanjutan** (if_sid/child, frequency/timeframe, same/different field, CDB lookup, PCRE2, grup), decoder parent/child, **logtest**, level, MITRE + sub-teknik |
| `SEC05` | **File Integrity (FIM)** — perubahan file, baseline, **who-data** (user/proses), `report_changes` (diff), registry Windows |
| `SEC06` | **SCA** — kebijakan CIS + hasil per check |
| `SEC07` | **Vulnerabilities** — CVE host/VM + status + **feed** (NVD/OVAL, sync) |
| `SEC08` | **Incidents** — daftar/kasus + timeline + assignee |
| `SEC09` | **Active Response** — aksi respons + riwayat + **script library**, timeout/**revert**, lokasi |
| `SEC10` | **Compliance** — laporan CIS/PCI/GDPR/HIPAA/NIST 800-53/TSC/ISO + unduh |
| `SEC11` | **Settings** — level, retensi, enrollment, **log source**, **agent groups**, **RBAC halus**, notifikasi (OBS) |
| `SEC12` | **Feeds & Forwarding** — feed ruleset, **feed vuln**, threat intel (IOC + OTX/URLHaus/AbuseIPDB/Maltiverse), log forwarder + preset |
| `SEC13` | **Inventory (Syscollector)** ★ MAJOR — hardware/OS/paket/net/port/proses/user/service/hotfix/browser-ext per agen |
| `SEC14` | **Live Query / IR** — kueri/perintah forensik jarak jauh + hasil |
| `SEC15` | **CDB Lists** — daftar key:value + entri (lookup rule) |
| `SEC16` | **Cloud & Containers** — akun AWS/Azure/GCP + temuan **CSPM** + event Docker + osquery |
| `SEC17` | **Malware** — temuan YARA/ClamAV/Defender + rule IOC |
| `SEC18` | **MITRE ATT&CK** — matriks taktik/teknik/**sub-teknik** + cakupan rule |

**Reuse:** `@/uix/datatable`, `@/lib/grid`, `/proxy/pages/*`, pola tab
(`APP02`/`APP04`), `recharts` (grafik), `jspdf`/`docx` (unduh laporan).

## 9. Keamanan & RBAC

- **Agent least privilege:** kolektor berjalan dengan hak minimal; FIM/rootcheck
  butuh akses file terbatas; daftar path/allowlist eksplisit.
- **Token agen:** `bot_agent` (hash) + mTLS; kunci enrollment per company, rotasi.
- **Ingest terbatas:** rate-limit, ukuran payload, kuota per agen (anti-flood).
- **Isolasi tenant:** semua query difilter `company_id` (cegah IDOR).
- **Raw event** dapat memuat data sensitif → retensi pendek + akses `VIEW`.
- **Active response** = aksi berisiko → `USRole("SEC","POST")` + audit; opsi
  approval (`APP04`/`BOOK`) untuk aksi destruktif.
- **Blok IP** via `NET` = perubahan berisiko (dry-run + rollback `NET`).
- **RBAC halus** (`sec_rbac_grant`): selain level-modul, grant berlingkup
  **agen/grup/file/node** dengan mode **black/white** (mis. batasi akses event
  ke node tertentu).
- **Live query** = eksekusi kode di endpoint → allowlist perintah, timeout,
  audit penuh, `USRole("SEC","POST")`.
- **Kredensial cloud** (`sec_cloud_account.credential_enc`) → terenkripsi,
  least-privilege (read-only posture), rotasi.

### 9.1 Otorisasi
- Baca: `VIEW`; ubah rule/agen/insiden/response: `POST`; aksi kritis: approval.
- `sec_rbac_grant` mempersempit/memperluas cakupan; evaluasi sebelum `USRole`.
- **Agent groups & script response** memengaruhi banyak endpoint → hanya admin;
  **cloud account** & **intel feed** (kunci API) hanya role berwenang.

## 10. Retensi

- `sec_event` → mis. 90 hari (`RE_DAYS_SEC_EVENT`).
- `sec_fim_event` → mis. 180 hari.
- `sec_event_alert` → mis. 180 hari.
- `sec_waf_event` → sudah ada (`RE_DAYS_SEC_WAF_EVENT`, 90 hari).
- `sec_vuln`/`sec_sca_result`/`sec_incident`/rule/decoder/laporan → persisten.
- `sec_response_action` → disimpan sebagai audit.
- `sec_malware_event` → mis. 180 hari (`RE_DAYS_SEC_MALWARE_EVENT`).
- `sec_container_event` → mis. 90 hari.
- `sec_live_query` → simpan hasil sebagai audit (retensi terbatas, mis. 90 hari).
- `sec_cloud_finding` → mis. 180 hari; `sec_cloud_account` persisten.
- `sec_intel_ioc` → cache IOC, retensi mengikuti `expires_at`; `sec_intel_feed`/
  `sec_rule_feed`/`sec_vuln_feed`/`sec_forwarder` → persisten (konfigurasi).
- `sec_syscollector_*` → persisten (snapshot terbaru + histori paket untuk
  re-evaluasi vuln); `sec_cdb_list`/`sec_cdb_entry`/`sec_agent_group`/
  `sec_response_script`/`sec_osquery_query`/`sec_rbac_grant` → persisten.

## 11. Integrasi Lintas-Modul

- **VMS** ([app_vms.md](app_vms.md)) — `sec_vuln`/`sec_sca_result` menempel ke
  `vms_host`/`vms_guest`; temuan menyatu dengan `vms_finding`.
- **NET** ([app_net.md](app_net.md)) — active response `BLOCK_IP` → `address-list`
  di MikroTik; korelasi `net_firewall_event`; **ingest syslog** (`net_syslog_event`).
- **WEB** ([app_web.md](app_web.md)) — **ingest log nginx** (access/error) via
  `sec_log_source`; korelasi dengan event WAF/perimeter.
- **POD** ([app_pod.md](app_pod.md)) — temuan image (`pod_scan_finding`) sebagai
  sinyal tambahan; **Docker Engine events** (`sec_container_event`).
- **Cloud (AWS/Azure/GCP)** — API-pull posture → `sec_cloud_account`/
  `sec_cloud_finding` (CSPM); korelasi dengan event host/container.
- **OBS** ([app_obs.md](app_obs.md)) — notifikasi (`obs_notification`), metrik
  pendukung, korelasi log.
- **BOT** — registrasi/heartbeat agen (`bot_agent`/`bot_heartbeat`).
- **JMS** — penjadwalan scan SCA/vuln, **sync `sec_vuln_feed`** + re-evaluasi,
  laporan compliance, **feed ruleset**, dan **sync threat intel** berkala.
- **APP06** ([app_sys.md](app_sys.md)) — notifikasi/dispatcher umum & integrasi
  eksternal (opsional untuk alert SEC).

## 12. Roadmap Implementasi

| Fase | Deliverable |
|---|---|
| **A. Agen & ingesti** | Model `sec_*` + migrasi; capability `security` di `osc_auto/agent_vm`; enroll + `sec_agent`; ingest log dasar (`sec_event`) + decoder/rule minimal. |
| **B. SIEM & event** | Rule engine + korelasi → `sec_event_alert`; halaman `SEC01`–`SEC04`; notifikasi via OBS. |
| **C. FIM & HIDS** | `sec_fim_event`, rootcheck; halaman `SEC05`; baseline. |
| **D. SCA & vulnerability** | `sec_sca_policy`/`sec_sca_result`, `sec_vuln`; halaman `SEC06`–`SEC07`; integrasi `VMS`. |
| **E. Incident & response** | `sec_incident`/`sec_incident_event`, `sec_response_action`; halaman `SEC08`–`SEC09`; active response host-level. |
| **F. Compliance & polish** | `sec_compliance_report` (CIS dulu); halaman `SEC10`–`SEC11`; impor ruleset Wazuh **subset**; test & dokumentasi. |
| **F2. Manajemen & intel** | **Upgrade agen jarak jauh**; **feed ruleset** (`sec_rule_feed`, jadwal `JMS`); **threat intel** (`sec_intel_feed`/`sec_intel_ioc`, VirusTotal/MISP **+ OTX/URLHaus/AbuseIPDB/Maltiverse**); **log forwarding** (`sec_forwarder` + preset); halaman `SEC12`. |
| **G. Syscollector ★ MAJOR** | Model `sec_syscollector_*`; collector inventaris agen; **feed vuln** (`sec_vuln_feed`, NVD/OVAL, offline, rentang versi); matangkan `sec_vuln`; halaman `SEC07`/`SEC13`. |
| **H. Rule DSL ★ MAJOR** | `sec_rule` DSL lanjutan (if_sid/child/composite, frequency/timeframe, same/different field, PCRE2, negasi, grup); **CDB lists** (`sec_cdb_list`); **decoder depth**; **logtest**; halaman `SEC04`/`SEC15`. |
| **I. Malware & telemetry lanjutan** | **YARA/ClamAV/Defender** (`sec_malware_event`); **auditd/command + FIM who-data** + registry Windows; halaman `SEC05`/`SEC17`. |
| **J. Response, live query & groups** | **Active response depth** (`sec_response_script`, timeout/revert, lokasi); **live query** (`sec_live_query`); **agent groups** (`sec_agent_group`); halaman `SEC09`/`SEC14`. |
| **K. Cloud, container & osquery** | **Cloud AWS/Azure/GCP + CSPM** (`sec_cloud_*`); **Docker runtime** (`sec_container_event`); **osquery** (`sec_osquery_query`); **Windows EventChannel+Sysmon**; halaman `SEC16`. |
| **L. RBAC, MITRE & skalabilitas** | **RBAC halus** (`sec_rbac_grant`); **MITRE sub-teknik + view** (`SEC18`); **skalabilitas manager/worker**; **platform breadth** (macOS ULS/Solaris); compliance **HIPAA/NIST 800-53/TSC**; presets alerting. |

## 13. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Banjir event (log volume) | Rate-limit, agregasi/korelasi, retensi pendek, level minimum. |
| Agen disalahgunakan | Least privilege, token+mTLS, allowlist path/perintah, audit. |
| False positive | Tuning rule/level, ack/ignore, MITRE context. |
| Active response salah sasaran | Konfirmasi + audit + approval; host-level dulu, blok IP hati-hati. |
| Data sensitif di raw log | Retensi pendek, akses `VIEW`, redaksi. |
| Beban DB time-series | Rollup + indeks + partisi bila perlu. |
| Inventory/syscollector besar | Snapshot terbaru + diff; retensi histori paket terbatas; indeks `agent_id`. |
| Feed vuln usang/salah rentang | Repo offline + checksum/versi; re-evaluasi terkontrol; validasi rentang versi. |
| Live query disalahgunakan | Allowlist perintah, timeout, audit, hanya role berwenang. |
| Kredensial cloud bocor | Enkripsi (`credential_enc`), read-only, rotasi, akses terbatas. |
| Rule DSL kompleks membingungkan | Logtest, validasi skema, preset bawaan, dokumentasi. |
| RBAC halus salah konfigurasi | Default deny, audit, lintas-cek `USRole`. |

### 13.1 Non-tujuan (batas lingkup)

- **Bukan** pengganti WAF perimeter — WAF tetap modul terpisah (`sec_waf_*`).
- **Tanpa OpenSearch/Elasticsearch** — PostgreSQL saja.
- **Agentless & auto-block IP tetap ditangguhkan** (fase lanjutan).
- **Platform breadth terbatas** — macOS ULS/Solaris/cloud log dicatat, bukan
  prioritas; fokus Windows/Sysmon, Linux, Docker.
- **Cloud/CSPM** adalah posture API-pull dasar, bukan parity penuh dengan CSPM
  komersial.
- **Rule DSL** mengikuti **subset** Wazuh (bukan seluruh sintaks).

## 14. Keputusan

### 14.1 Terkonfirmasi
- [x] Modul **`SEC`** (Security Operations/SIEM, ala Wazuh) ditambahkan; cluster
  `sec_*` (WAF tetap sebagai sub-domain perimeter).
- [x] Agen: capability **`security`** pada `osc_auto/agent_vm`; agen tidak akses DB.
- [x] Tanpa OpenSearch/Elasticsearch — pakai PostgreSQL.

### 14.2 Terkonfirmasi lanjutan
- [x] **Active response host-level dulu** (`KILL_PROCESS`/karantina); **blok IP via
  `NET` menyusul** (menunggu auto-block NET diaktifkan).
- [x] Impor **ruleset Wazuh (subset)** dulu, bukan penuh.
- [x] **Agentless (SSH-pull)** menyusul (agent-based dulu, fase lanjutan).
- [x] Framework compliance prioritas: **CIS dulu**, lalu PCI-DSS/ISO 27001.
- [x] **Upgrade agen jarak jauh** + pelaporan versi (`sec_agent`).
- [x] **Feed ruleset** terjadwal (`sec_rule_feed`, via `JMS`).
- [x] **Threat intel** VirusTotal/MISP (`sec_intel_feed`/`sec_intel_ioc`) untuk pengayaan.
- [x] **Log forwarding** ke syslog/webhook eksternal (`sec_forwarder`).

### 14.3 Perlu konfirmasi
- [ ] Approval aksi kritis via **`APP04`/`BOOK`**?

### 14.4 Terkonfirmasi — penutupan gap (kelengkapan)

- [x] ★ **MAJOR — Syscollector/inventaris** (`sec_syscollector_*`) sebagai
  fondasi deteksi kerentanan & kueri IR.
- [x] ★ **MAJOR — Rich rule DSL** (`if_sid`/child/composite, frequency/timeframe,
  same/different field, lookup CDB, PCRE2, negasi, grup).
- [x] **CDB lists** (`sec_cdb_list`/`sec_cdb_entry`).
- [x] **Malware detection** YARA/ClamAV/Defender (`sec_malware_event`).
- [x] **Vulnerability feed** (`sec_vuln_feed`, NVD/OVAL, offline, rentang versi).
- [x] **Docker/container runtime listener** (`sec_container_event`).
- [x] **Osquery** terkelola agen (`sec_osquery_query`).
- [x] **Command/auditd + FIM who-data** + `report_changes` + registry Windows.
- [x] **Active-response depth** (`sec_response_script`, timeout/revert, lokasi).
- [x] **Remote live queries** (`sec_live_query`).
- [x] **Agent groups centralized config** (`sec_agent_group`).
- [x] **Compliance mapping** PCI/GDPR/**HIPAA/NIST 800-53/TSC** (CIS tetap dulu).
- [x] **wazuh-logtest** (`POST /SEC/logtest`).
- [x] **Windows EventChannel + Sysmon** (menutup pertanyaan §14.3).
- [x] **Cloud security AWS/Azure/GCP + CSPM** (`sec_cloud_*`).
- [x] **Skalabilitas manager/worker** (LB agen + sinkron ruleset/kunci).
- [x] **RBAC halus** berlingkup agen/grup/file/node (`sec_rbac_grant`).
- [x] **MITRE sub-teknik** (`mitre_subtechnique`) + view `SEC18`.
- [x] **Threat intel tambahan** (OTX/URLHaus/AbuseIPDB/Maltiverse).
- [x] **Preset alerting** (Slack/PagerDuty/Shuffle) + filter halus.
- [x] **Decoder depth** (parent/child, offset, JSON, dynamic fields).
- [x] **Platform breadth** macOS ULS/Solaris/Docker/cloud — lingkup terbatas.

## 15. Referensi Internal (aset yang bisa dipakai ulang)

- WebSocket proxy pola: `osc_rest/mechanic/sshproxy.go`.
- Route & grup: `osc_rest/backbone/routes.go` (`pages`, `admin`, `agent`).
- Audit & privilege: `USLogs`, `USRole` di `osc_rest/backbone/memory.go`.
- Retensi: `osc_rest/backbone/retention.go`.
- Agen per-VM: **`osc_auto/agent_vm`** (capability `security`; backend = penghubung DB).
- Notifikasi: `obs_notification` (OBS).
- Konvensi cluster DB: `osc_base/prisma/schema/cluster_sec.prisma`,
  [database/cluster_sec.md](../database/cluster_sec.md).
- Referensi eksternal: Wazuh, OSSEC (konsep rule/decoder/FIM/SCA).
