# Osc_base — `prisma/schema/cluster_sec.prisma`

> Dokumen detail cluster **SEC** — Keamanan Perimeter / WAF + **SIEM/HIDS/XDR**
> (`sec_*`). 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster SEC menyimpan aturan WAF dan event blokir. Tabel **event termasuk log**
dan dipurge oleh retention (`RE_DAYS_SEC_WAF_EVENT`, default 90 hari).

Selain WAF, cluster `sec_*` menampung rencana **SIEM/HIDS/XDR** (modul `SEC`,
ala Wazuh) — lihat §2.3 dan §4. Dua penambahan **MAJOR**: **Syscollector
(inventaris sistem)** dan **Rich rule DSL**.

## 2. Model

### 2.1 `sec_waf_rule`
- `@@unique([company_id, code])`.
- `rule_type` ∈ `CUSTOM | SQLI | XSS | RCE | RATE_LIMIT`;
  `action` ∈ `ALLOW | BLOCK | LOG`; `priority`, `severity`, `is_active`.

### 2.2 `sec_waf_event`
- `source_ip`, `method`, `path`, `action`, `severity`, `occurred_at`.
- Indeks `company_id`, `rule_id`, `occurred_at`.
- Relasi opsional ke `sec_waf_rule`.

### 2.3 Rencana model SIEM/HIDS/XDR — **belum dibangun**

#### 2.3.1 Inti SIEM
- `sec_agent` — `agent_id`? (→ `bot_agent`), `host_ref`?, `os`, `arch`,
  `agent_version`, `upgrade_available`, `mode` (AGENT/AGENTLESS), `group`?,
  `policy_id`?, `status`, `last_seen`; `@@unique([company_id, code])`.
- `sec_agent_group` — grup agen + config bersama (`agent_conf`); `@@unique([company_id, code])`.
- `sec_decoder` — `program_name`, `prematch`, `regex`, `order` (JSON),
  `parent_id`? (parent/child), `offset`?, `is_json`, `dynamic_fields` (Json),
  `source` (BUILTIN/CUSTOM).
- `sec_log_source` — `type` (AGENT/SYSLOG/API/FILE), `host`?, `port`?,
  `decoder_id`?, `web_server_id`?/`net_device_id`?; **ingest `WEB`/nginx, syslog
  `NET`, EventChannel/Sysmon, Docker, cloud**.
- `sec_rule` — **Rich DSL (★ MAJOR)**: `level`, `category`, `parent_id`?,
  `if_sid` (Json), `if_group`, `match`?, `regex`? (PCRE2), `offset`?, `negate`,
  `frequency`?, `timeframe`?, `same_field`?, `different_field`?,
  `same_source_ip`?, `list_ref`? (→ `sec_cdb_list`), `rule_group`, `severity`,
  `mitre_tactic`/`mitre_technique`/`mitre_subtechnique`?, array
  `compliance_pci_dss`/`gdpr`/`hipaa`/`nist_800_53`/`tsc`; `@@unique([company_id, code])`.
- `sec_cdb_list` / `sec_cdb_entry` — daftar `key:value` lookup rule;
  `@@unique([company_id, name])` / indeks `[list_id, key]`.
- `sec_event` — telemetry: `agent_id`, `rule_id`?, `type`, `level`, `severity`,
  `src_ip`, `dst_ip`, `user_name`, `process`, `file`, `command`, `message`,
  MITRE, `raw` (Json), `occurred_at`.
- `sec_event_alert` — alert terkorelasi: `rule_id`, `agent_id`?, `count`,
  `first_seen`/`last_seen`, `status`, `incident_id`?.
- `sec_fim_event` — FIM **who-data**: `event_type`, checksum before/after,
  `user_name`?/`process_name`?/`process_id`?/`audit_uid`?, `report_changes`
  (Json diff), `registry_key`? (Windows).
- `sec_sca_policy` / `sec_sca_result` — benchmark CIS + hasil per check.
- `sec_vuln` — CVE host/VM (`installed_version`/`fixed_version`, status).

#### 2.3.2 Syscollector — inventaris sistem **(★ MAJOR)**
- `sec_syscollector_hardware`, `_os`, `_package`, `_iface` (interface/alamat),
  `_port` (protokol/port), `_process`, `_user`, `_group`, `_service`, `_hotfix`,
  `_browser_ext`.
- Kunci `agent_id` (+ `company_id`) + indeks waktu sinkronisasi; **fondasi
  deteksi kerentanan** (paket → CVE) dan kueri IR.

#### 2.3.3 Malware, container, cloud, osquery
- `sec_malware_event` — YARA/ClamAV/Defender: `scanner`, `path`?/`signature`?/
  `hash`?, `severity`, `action`, `raw` (Json).
- `sec_container_event` — Docker Engine: `container_id`, `event`
  (START/EXEC/PRIVILEGED/VOLUME/IMAGE/…), `image`?, `raw` (Json).
- `sec_cloud_account` / `sec_cloud_finding` — AWS/Azure/GCP + CSPM.
- `sec_osquery_query` — kueri SQL osquery + jadwal/grup.
- `sec_vuln_feed` — feed CVE (NVD/VENDOR_OVAL/CUSTOM), `offline_path`?,
  `last_synced_at`, `auto_update`; `@@unique([company_id, name])`.

#### 2.3.4 Incident, response & tata kelola
- `sec_incident` / `sec_incident_event` — kasus + tautan alert/event.
- `sec_response_action` — active response lanjutan: `action`, `script_id`?,
  `location` (LOCAL/SERVER/ALL), `timeout`?, `revert`, `reverted_at`?.
- `sec_response_script` — registry skrip bawaan/kustom.
- `sec_live_query` — kueri/perintah IR jarak jauh: `kind`, `payload`, `status`,
  `result` (Json), `requested_by`?.
- `sec_rbac_grant` — RBAC halus: `scope` (AGENT/GROUP/FILE/NODE), `mode`
  (BLACK/WHITE).
- `sec_compliance_report` — CIS/PCI/GDPR/**HIPAA/NIST 800-53/TSC**/ISO.
- `sec_rule_feed` — feed ruleset/decoder; `sec_intel_feed`/`sec_intel_ioc` —
  threat intel (VirusTotal/MISP/**OTX/URLHaus/AbuseIPDB/Maltiverse**).
- `sec_forwarder` — log forwarding + `preset` (SLACK/PAGERDUTY/SHUFFLE) +
  `field_filters`.

## 3. Relasi Inti

```text
sec_waf_rule (1) ──► (N) sec_waf_event

sec_agent (1) ──► (N) sec_event · sec_fim_event · sec_sca_result · sec_vuln ·
                       sec_syscollector_* · sec_malware_event ·
                       sec_container_event · sec_live_query
sec_agent_group (1) ──► (N) sec_agent
sec_rule (1) ──► (N) sec_event_alert ──► (N) sec_incident_event ──► sec_incident
sec_rule.list_ref ──► sec_cdb_list (1) ──► (N) sec_cdb_entry
sec_decoder (1) ──► (N) sec_event
sec_response_script (1) ──► (N) sec_response_action
sec_vuln_feed ──(match)──► sec_vuln   sec_syscollector_package ──► sec_vuln
sec_intel_feed (1) ──► (N) sec_intel_ioc ──(enrich)──► sec_event_alert / sec_vuln
sec_rbac_grant ──(grant)──► sec_agent / sec_agent_group / file / node
```

## 4. Catatan

- Cluster `sec_*` menampung rencana **SIEM/HIDS/XDR** (modul `SEC`, ala Wazuh)
  beserta **penutupan gap** terbaru — **belum dibangun**. Rincian lengkap:
  [../planning/app_sec.md](../planning/app_sec.md).
- **MAJOR**: **Syscollector** (`sec_syscollector_*`) & **Rich rule DSL**
  (`sec_rule`).
- `sec_waf_event`, `sec_event`, `sec_fim_event`, `sec_malware_event`,
  `sec_container_event`, `sec_live_query`, `sec_cloud_finding` masuk daftar
  retensi `osc_rest/backbone/retention.go`; `sec_syscollector_*` persisten
  (snapshot + histori paket).
- Konvensi umum model: [README.md](README.md#4-konvensi-model).
