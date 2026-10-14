# Checklist — Status Aplikasi

> Checklist aplikasi OmniSight yang **sudah** dibuat dan yang **akan** dibuat.
> Tandai `[x]` bila lapisan terkait selesai dan terverifikasi.

## Definition of Done

Sebuah aplikasi dinyatakan **Selesai** bila seluruh lapisan berikut terpenuhi:

- [ ] **DB** — model Prisma + migrasi + (bila perlu) seed modul.
- [ ] **Backend** — skeleton `appNN/` + route terdaftar + validasi.
- [ ] **Frontend** — halaman `APPNN/` (page + api + schemas + components).
- [ ] **Docs** — dokumentasi database/backend/frontend + entri planning.
- [ ] **Test** — lolos `osc_docs/testing` (dan/atau E2E aplikasi).

---

## A. Sudah Dibuat

> Planning rinci per modul yang sudah ada: [modules/](modules/README.md).

### A.1 Core & Identitas

#### `APP00` / `PUB00` — Navigation & Auth
- [x] DB — memakai `app_user`, `app_user_token`, `app_company`, `app_module`.
- [x] Backend — `PUB00` (company/login), `APP00` (logout/company/module).
- [x] Frontend — layout board, sidebar dinamis, `CompanyCombobox`, login.
- [x] Docs — backend/frontend/konvensi.
- [x] Test — `test_backend_api.py` (login, company, module, profil).

#### `APP01` — Module
- [x] DB — `app_module` (hierarki `parent_id`).
- [x] Backend — CRUD `/APP01/modules`, fan-out `applink`.
- [x] Frontend — `module-table` + `module-form`.
- [x] Docs — backend/frontend/database.
- [x] Test — `test_backend_api.py` (module list).

#### `APP02` — Company
- [x] DB — `app_company`, `app_company_module`, `app_company_area`.
- [x] Backend — CRUD company + modules + areas.
- [x] Frontend — `company-table`, `company-form`, `modules-tab`, `areas-tab`.
- [x] Docs — backend/frontend/database.
- [x] Test — cakupan perusahaan/auth.

#### `APP03` — User
- [x] DB — `app_user`, `app_user_company`, `app_user_privilege`, `app_user_area`.
- [x] Backend — CRUD user + companies + privileges + areas.
- [x] Frontend — `user-table`, `user-form`, `companies-tab`, `privileges-tab`,
      `areas-tab`.
- [x] Docs — backend/frontend/database.
- [x] Test — cakupan user/privilege.

#### `APP04` — Signature
- [x] DB — `app_signature_type`, `app_approval_step`, `app_approval_sign`,
      `app_signature_form`, `app_signature_flag`.
- [x] Backend — CRUD types + steps + signers + forms + flags.
- [x] Frontend — `types-table/form`, `steps-tab`, `signers-tab`,
      `forms-table/form`, `flags-tab`.
- [x] Docs — backend/frontend/database.
- [x] Test — cakupan signature.

#### `APP05` — Session / Token / Action
- [x] DB — `app_user_session`, `app_user_token`, `app_user_action`.
- [x] Backend — CRUD sessions + tokens, list/get actions (audit baca).
- [x] Frontend — `sessions-table/form`, `tokens-table/form`, `actions-table`.
- [x] Docs — backend/frontend.
- [x] Test — `e2e_app05.py` (sesi & token) + audit via `USLogs`.

#### `SYS01`–`SYS03` — Session Profile
- [x] DB — `app_user`.
- [x] Backend — `SYS01Profile`, `SYS02Password`, `SYS03History`.
- [x] Frontend — `profile-card`, ubah password, riwayat.
- [x] Docs — backend/frontend.
- [x] Test — `test_backend_api.py` (profil/password/history).

### A.2 Layanan Lintas-Modul

- [x] `applink` — auto-insert `app_company_module` / `app_user_company` /
      `app_user_privilege` + delete cascade.
- [x] `USLogs` — audit mutasi admin → `app_user_action` (module dari path).
- [x] `USRole` — cek privilege modul.
- [x] Pohon menu — parent tampil bila ada turunan non-`HIDE` (recursive).
- [x] Auto-generate dokumen & test dasar (`osc_docs`).
- [ ] `UploadHandler` — handler ada, **belum** diregistrasi ke route.

---

## B. Akan Dibuat

> **Catatan:** seluruh **lapisan DB** untuk aplikasi di Fase 2–5 **sudah dibangun**
> (cluster `amm/net/vms/pod/sec/web/jms/bot/dso/obs/doc`, migrasi
> `20261009022147_planned_clusters`). Pengecualian: cluster **`pam`** (Bastion)
> **belum dibangun** (rencana [app_pam.md](app_pam.md)). Sisa pekerjaan
> per aplikasi: backend, frontend, dokumen, dan test.
> Lihat [database/cluster_*.md](../database/README.md).

### B.1 Fase 2 — Aset & Inventaris

#### `AMM` — Asset Management & CMDB
- [x] DB — `amm_asset`, `amm_asset_type`, `amm_asset_tag`.
- [x] DB — tabel aset lokasi: `amm_asset_device`, `amm_digital_signage`,
      `amm_store_account`, `amm_store_edc` (lihat
      [additional.md](additional.md)).
- [ ] DB — CMDB/lanjutan: perluas `amm_asset` + `amm_asset_assignment`,
      `amm_asset_relation`, `amm_license`, `amm_license_seat`, `amm_software`,
      `amm_maintenance` (lihat [app_amm.md](app_amm.md)).
- [ ] DB — **paritas Snipe-IT (MAJOR)**: `amm_asset_model`, `amm_manufacturer`,
      `amm_fieldset`/`amm_fieldset_field`/`amm_fieldset_binding`,
      `amm_asset_audit`/`amm_audit_item`, `amm_depreciation`, `amm_department`,
      `amm_status_type`/`amm_status_label`.
- [ ] DB — custom fields, supplier/kontrak & stok: `amm_custom_field`,
      `amm_custom_value`, `amm_supplier`, `amm_contract`, `amm_contract_asset`,
      `amm_consumable`, `amm_consumable_txn`, `amm_accessory`,
      `amm_accessory_assignment`, `amm_accessory_txn`, `amm_component`,
      `amm_component_assignment`, `amm_kit`/`amm_kit_item`/`amm_kit_checkout`,
      `amm_reservation`, `amm_eula`/`amm_eula_acceptance`, `amm_asset_request`,
      `amm_api_token`/`amm_api_log`.
- [ ] Backend — skeleton `amm/` + route + validasi (termasuk nested resource
      `assets/:id/{devices,signage,accounts,edc,software,relations,maintenance}`).
- [ ] Frontend — **satu halaman** `AMM/` dengan tab (Lokasi/Perangkat/Signage/
      Akun/EDC/Software/Maintenance/Relasi/Riwayat) + halaman lisensi, CMDB,
      **custom fields, suppliers/contracts, consumables, requests, reports,
      asset models, fieldsets, audit, depreciation, departments/status,
      accessories/components/kits/reservations, EULA, API**
      (`AMM10`–`AMM17`).
- [ ] Backend — export Excel `excelize`: satu berkas **updateable**
      backend-only (`/root/exports/amm_assets.xlsx`), massal (store aktif),
      3 sheet (Aset / Akun Toko / EDC), endpoint `GET /AMM/assets/export`
      dengan `USLoad(), USRole("AMM","POST")` (admin bypass).
- [ ] Frontend — tombol **Export Excel** (massal) + label **QR/barcode** di AMM.
- [ ] Docs — [app_amm.md](app_amm.md) + `cluster_amm.md` + README terkait.
- [ ] Test — unit + E2E.

#### `NET` — Network & MikroTik (firewall)
- [x] DB — `net_subnet`, `net_device`, `net_interface`.
- [ ] DB — manajemen MikroTik: kolom manajemen + **SNMP** di `net_device`; tabel `net_firewall_rule`, `net_address_list_entry`, `net_config_backup`, `net_change`, `net_firewall_event`, `net_interface_stat`, `net_interface_stat_rollup`, `net_sensor`, `net_sensor_stat_rollup`, `net_syslog_event`, `net_topology_link`, `net_discovery`, `net_device_group`, `net_alert_rule`/`net_alert`, `net_maintenance_window`, `net_billing`, `net_availability`/`net_ping_result`, `net_vlan`, `net_ip_address`, `net_entity_physical`, `net_config_revision`, `net_custom_oid`, `net_api_token` (lihat [app_net.md](app_net.md)). ⏸️ `net_blocklist`/`net_block_entry`/`net_script` ditangguhkan.
- [ ] Backend — skeleton `net/` + klien RouterOS di **agen `osc_auto/agent_vm`** (**keduanya**: API biner v6/v7 + REST v7) + endpoint `/rest/agent/net/*` + uji koneksi.
- [ ] Backend — inventaris & monitoring (resource, interface, counter) read.
- [ ] Backend — firewall CRUD (filter/NAT/mangle/raw), enable/disable, reorder, clone/reset-counter, time-based rules, address-list; **safe apply** (snapshot/dry-run/rollback otomatis) + audit `net_change`.
- [ ] Backend — backup/diff/restore (export `.rsc` + biner `.backup`) + backup terjadwal (via `JMS`).
- [ ] Backend — **SNMP v2c/v3** poll (health + trafik/interface + **sensor** suhu/tegangan/fan/PSU + **optik SFP DDM/DOM** + **PoE**) + **rollup** + **trap/syslog receiver** + **topologi L2** (LLDP/CDP/FDB) + **discovery** subnet/SNMP/ARP.
- [ ] Backend — **paritas LibreNMS**: alerting rules + transport (petakan `net_*`→`OBS`), ambang per-sensor/port, device/port groups, billing/95th, availability/SLA+RTT/loss, riwayat sensor/optik/PoE, VLAN, IP address table, inventory ENTITY-MIB, metadata interface, maintenance window, config search/revisi, custom MIB/OID, API token read-only.
- [ ] Backend — **hardening**: `/user`+group, `/ip/service`, SSH keys, remote syslog.
- [ ] Frontend — halaman `NET01`–`NET19` (dashboard, device, detail+grafik SNMP+sensor+optik+PoE, firewall, address-lists, backup/diff, logs/syslog, change history, hardening, topology, discovery, **alerts/threshold, groups, billing, availability, VLAN/IP, inventory, maintenance, config, custom MIB, API token**).
- [ ] Docs — `app_net.md`, `cluster_net.md` + README terkait.
- [ ] Test.

#### `VMS` — VM & Hypervisor Management
- [x] DB — `vms_host`, `vms_guest`, `vms_finding`.
- [ ] DB — perluas `vms_host`/`vms_guest` (mgmt/SNMP-like); tabel `vms_snapshot`, `vms_task`, `vms_template`, `vms_nic`, `vms_storage`, `vms_iso`, `vms_backup` (lihat [app_vms.md](app_vms.md)).
- [ ] DB — **paritas Proxmox/Incus (MAJOR)**: `vms_fw_rule`/`vms_security_group`, `vms_sdn`, `vms_pool`, `vms_cluster`/`vms_node`, `vms_ha`, `vms_replication`, `vms_passthrough`; perluas `vms_guest` (boot/hotplug/agent/cloud-init meta+network), `vms_snapshot` (RAM/live), `vms_backup` (retensi/verifikasi/enkripsi).
- [ ] Backend — skeleton `vms/` + driver hypervisor di agen (`vmhost`, Incus/LXD dulu) + endpoint `/rest/agent/vms/*`; sync inventaris.
- [ ] Backend — power (start/stop/reboot/suspend), snapshot, clone, resize, console (noVNC/SPICE opsional), tasks; audit (`vms_task` + `USLogs`).
- [ ] Backend — **provisioning**: create VM (ISO/template) + cloud-init (user-data + meta/network), NIC/bridge/VLAN/SDN, storage pool & ISO library, backup/restore VM (retensi/verifikasi/enkripsi).
- [ ] Backend — **firewall per-VM/SG**, cluster/HA/replikasi, resource pool, hotplug, PCI/USB passthrough, disk move, raw config, boot order, guest-agent exec, bulk power.
- [ ] Backend — findings + impor dari `SEC`; metrik via `OBS`.
- [ ] Frontend — halaman `VMS01`–`VMS15` (dashboard/hosts/guests/detail/snapshots/templates/findings/tasks/create/storage-iso/backups/**firewall, cluster/HA, SDN/pool**).
- [ ] Docs — [app_vms.md](app_vms.md) + `cluster_vms.md`.
- [ ] Test.

#### `POD` — Container/Pod (K8s + Docker/Podman)
- [x] DB — Kubernetes: `pod_cluster`, `pod_node`, `pod_workload`.
- [ ] DB — runtime Docker/Podman: `pod_engine`, `pod_stack`,
      `pod_stack_revision`, `pod_service`, `pod_container`, `pod_image`,
      `pod_volume`, `pod_network`, `pod_registry`, `pod_action`, `pod_env_var`,
      `pod_git_credential`, `pod_git_sync`, `pod_build`, `pod_backup`,
      `pod_scan`, `pod_scan_finding`, `pod_template`, `pod_template_registry`,
      `pod_exec_session` (+ `pod_pod`, `pod_secret`, `pod_disk_usage`; migrasi).
- [ ] DB — **paritas Dockge/Arcane**: `pod_update_check`, `pod_heal_policy`,
      `pod_backup_schedule`, `pod_system_backup`, `pod_patch`, `pod_scan_schedule`,
      `pod_threat_intel`, `pod_registry_repository`/`pod_registry_tag`,
      `pod_port_binding`, `pod_gpu`, `pod_notification_channel`/
      `pod_notification_template`, `pod_log_setting`, `pod_api_key`, `pod_webhook`.
- [ ] Backend — skeleton `pod/` + `mechanic/dockerclient` (Engine API) +
      operasi Compose (`docker compose` via `os/exec`) + `pod_engine`
      CRUD/ping.
- [ ] Backend — project/container/image/volume/network/registry CRUD + aksi
      lifecycle + audit `pod_action`.
- [ ] Backend — Git Sync/GitOps (pull + push), image build (via `DSO`),
      vulnerability scan (Trivy), backup/restore volume, templates, env vars.
- [ ] Backend — registry **push**/login; Compose lanjutan (override/profiles/
      env-file/scale/config/rollback); `system df`/prune; resource limit + stats;
      file browser/`cp`; TLS/context; **pods & Quadlet** Podman; secrets/configs.
- [ ] Backend — **deteksi update image** (digest/semver tag strategy + rewrite compose), **event-driven check**, **auto-heal**, **import/adopt** stack, **webhook** (`pod_webhook`), **bulk ops**, **notifikasi event** (deploy/update/restart-loop → `APP06`), **browse isi volume** (+ edit in-place/rename/restore file).
- [ ] Backend — **paritas Arcane**: patch image (Copacetic), scan terjadwal + risk scoring/KEV/EPSS, backup terjadwal + system backup, browse registry, topologi/ports, GPU, log terstruktur, notifikasi provider+templating, API key scoped + OpenAPI, CLI.
- [ ] Backend — streaming WS/SSE: log, terminal exec, events.
- [ ] Frontend — halaman `POD01`–`POD16` (projects/containers/images/volumes/
      engines/registries/scans/templates/activity/k8s/system/webhooks/**updates-patching/insights/notifications/api-keys**).
- [ ] Docs — [app_pod.md](app_pod.md) (rencana) + `cluster_pod.md` + README terkait.
- [ ] Test — unit + E2E (Docker API).

### B.2 Fase 3 — Keamanan, Akses & Web

#### `WAF` — Web Application Firewall
- [x] DB — `sec_waf_rule`, `sec_waf_event`.
- [ ] Backend — skeleton `waf/`.
- [ ] Frontend — halaman `WAF/`.
- [ ] Docs — `cluster_sec.md`.
- [ ] Test.

#### `SEC` — Security Operations / SIEM (ala Wazuh)
- [x] DB — `sec_waf_rule`, `sec_waf_event` (perimeter/WAF, sudah ada).
- [ ] DB — SIEM/HIDS: `sec_agent`, `sec_decoder`, `sec_rule`, `sec_event`,
      `sec_event_alert`, `sec_fim_event`, `sec_sca_policy`, `sec_sca_result`,
      `sec_vuln`, `sec_incident`, `sec_incident_event`, `sec_response_action`,
      `sec_compliance_report`, `sec_log_source`, `sec_rule_feed`, `sec_intel_feed`,
      `sec_intel_ioc`, `sec_forwarder` (lihat [app_sec.md](app_sec.md)).
- [ ] DB — **paritas Wazuh (MAJOR: syscollector + rule DSL)**: `sec_syscollector_*`,
      `sec_agent_group`, `sec_cdb_list`/`sec_cdb_entry`, `sec_malware_event`,
      `sec_vuln_feed`, `sec_container_event`, `sec_osquery_query`, `sec_live_query`,
      `sec_response_script`, `sec_rbac_grant`, `sec_cloud_account`/`sec_cloud_finding`.
- [ ] Backend — skeleton `sec/` + `mechanic/siem/` (rule engine, decoder, korelasi) + capability agen `security` (`/rest/agent/sec/*`).
- [ ] Backend — FIM (who-data/diff/registry), SCA, vulnerability detection, incident, active response (script/timeout/revert), compliance; **ingest log `WEB`/nginx & syslog `NET`** (`sec_log_source`).
- [ ] Backend — **upgrade agen jarak jauh**, **feed ruleset** (`sec_rule_feed`), **threat intel** (`sec_intel_feed`/`sec_intel_ioc`), **log forwarding** (`sec_forwarder`).
- [ ] Backend — **syscollector**, **rule DSL** (if_sid/frequency/list/PCRE2), CDB, malware (YARA/ClamAV/Defender), vuln feed, Docker runtime, osquery, command/auditd, live query, agent groups, compliance mapping, logtest, cloud/CSPM, fine RBAC, MITRE sub-teknik, feed tambahan, decoder depth.
- [ ] Frontend — halaman `SEC01`–`SEC18` (dashboard/agents/events/rules/fim/sca/vulns/incidents/response/compliance/settings/feeds-forwarding/**inventory/live-query/cdb/cloud-containers/malware/mitre**).
- [ ] Docs — [app_sec.md](app_sec.md) + `cluster_sec.md`.
- [ ] Test.

#### `PAM` — Bastion / Privileged Access (ala JumpServer)
- [ ] DB — `pam_asset`, `pam_account`, `pam_policy`, `pam_grant`,
      `pam_command_filter`, `pam_session`, `pam_command`, `pam_access_request`,
      `pam_gateway` + migrasi `cluster_pam.prisma` (lihat [app_pam.md](app_pam.md)).
- [ ] DB — **paritas JumpServer**: `pam_login_acl`, `pam_lockout`,
      `pam_account_template`, `pam_command_filter_binding`, `pam_approval_flow`/
      `pam_approval_step`/`pam_access_request_approval`, `pam_apikey`,
      `pam_health_check`, `pam_discovery_job`, `pam_ticket_provider`.
- [ ] Backend — skeleton `pam/` + `mechanic/pam/` (gateway SSH/SFTP/RDP/VNC, vault, command filter, recording) + capability agen `pam` (`/rest/agent/pam/*`).
- [ ] Backend — RBAC per-aset (`pam_grant`/`pam_policy`), perekaman/replay, live monitor, approval/access request (`APP04`); **SSH gateway native** (`pam_gateway`), **MFA TOTP/WebAuthn**, **watermark**, **reason wajib**, rotasi kredensial.
- [ ] Backend — **login ACL bastion (MAJOR)**, **kontrol clipboard RDP/VNC (MAJOR)**, share sesi, command log store pluggable, account template, bulk import, tiket eksternal, approval multi-level, idle timeout, lockout/cap sesi, native RDP, discovery, API key, health check.
- [ ] Frontend — halaman `PAM01`–`PAM11` (dashboard/assets/accounts/policies/live/sessions/filters/requests/settings/gateway-security/**login-acl**).
- [ ] Docs — [app_pam.md](app_pam.md) + `cluster_pam.md`.
- [ ] Test.

#### `WEB` — Web Server/Proxy + Domain & DNS (ala Nginx UI)
- [x] DB — `web_vhost`, `web_certificate`, `web_upstream`.
- [ ] DB — `web_server`, `web_stream`, `web_access_list`, `web_access_entry`,
      `web_acme_account`, `web_dns_provider`, `web_domain`, `web_dns_record`,
      `web_config_revision`, `web_change`, `web_access_log`,
      `web_access_stat` + perluas `web_vhost`/`web_upstream`/`web_certificate` (lihat [app_web.md](app_web.md)).
- [ ] DB — **paritas Nginx UI/NPM**: `web_location`, `web_snippet`, `web_template`,
      `web_server_metric`, `web_backup`, `web_deploy`; perluas `web_access_list`
      (satisfy/pass-auth) & `web_certificate` (RSA/EC, OCSP, ARI, wildcard/SAN).
- [ ] Backend — skeleton `web/` + `mechanic/nginx/` (generator config, safe apply) + capability agen `web` (`/rest/agent/web/*`).
- [ ] Backend — TLS/**ACME** (HTTP-01/DNS-01 auto-renew, wildcard), **domain/DNS/WHOIS/DDNS**, revisi+rollback, **analitik log akses/error + live tail**, log nginx → `SEC`.
- [ ] Backend — tuning lanjutan (WS/HSTS/redirect/location), wizard, snippet/template, metrik node, upgrade nginx, backup/export-import, cluster deploy, dead/404, static files, reverse index.
- [ ] Frontend — halaman `WEB01`–`WEB15` (dashboard/servers/sites/upstreams/streams/certs/access/domains/changes/settings/analytics/**snippets-templates/backup-portability/cluster-deploy**).
- [ ] Docs — [app_web.md](app_web.md) + `cluster_web.md`.
- [ ] Test.

### B.3 Fase 4 — Operasional & Otomasi

#### `JMS` — Job Management
- [x] DB — `jms_job`, `jms_schedule`, `jms_run`.
- [ ] Backend — skeleton `jms/`.
- [ ] Frontend — halaman `JMS/`.
- [ ] Docs — `cluster_jms.md`.
- [ ] Test.

#### `BOT` — Bot/Agent
- [x] DB — `bot_agent`, `bot_heartbeat`, `bot_task`.
- [ ] Backend — skeleton `bot/` + grup `/rest/agent`.
- [ ] Frontend — halaman `BOT/`.
- [ ] Docs — `cluster_bot.md`.
- [ ] Test.

#### `DSO` — DevOps/CI-CD
- [x] DB — `dso_pipeline`, `dso_build`, `dso_deploy`.
- [ ] Backend — skeleton `dso/`.
- [ ] Frontend — halaman `DSO/`.
- [ ] Docs — `cluster_dso.md`.
- [ ] Test.

#### `OBS` — Observability & Server/Container Monitoring (pengganti Beszel)
- [x] DB — `obs_metric`, `obs_log`, `obs_alert`.
- [ ] DB — monitoring: `obs_system`, `obs_metric_rollup`, `obs_disk`,
      `obs_container_stat`, `obs_vmhost`, `obs_vm`, `obs_vm_stat`, `obs_check`,
      `obs_check_group`, `obs_check_result`, `obs_alert_rule`, `obs_notification`,
      `obs_silence`, `obs_dashboard`, `obs_report`, `obs_maintenance`,
      `obs_status_page`, `obs_status_page_item`, `obs_service`,
      `obs_status_page_incident`, `obs_import_job` (+ perluas `obs_metric`,
      `obs_disk` Btrfs/eMMC/mdraid, `obs_check` opsi HTTP/proxy + tipe
      KEYWORD/JSON/PUSH/CERT/DOMAIN/GRPC/MQTT/DATABASE per-engine/SMTP/Radius/WS,
      `obs_notification` kanal diperluas, migrasi; grup/dependensi/tag/retry/
      upside-down).
- [ ] Backend — skeleton `obs/` + agen `osc_auto/agent_vm` (gopsutil + Engine
      API + **vmhost** hypervisor, prioritas Incus/LXD + **systemd service** +
      Btrfs/eMMC/mdraid) + endpoint agen (`/rest/agent/obs/*`) +
      evaluator alert + notifikasi (kanal diperluas) + status page publik +
      insiden/pengumuman + expiry check + **ekspor Prometheus** (`/rest/metrics`) +
      real-time ~1s + impor Uptime Kuma.
- [ ] Frontend — halaman `OBS01`–`OBS13` (dashboard/systems/detail/containers/
      checks/alerts/notifications/settings/**vm-host**/reports/**status-page**/
      **maintenance**/**services**).
- [ ] Docs — [app_obs.md](app_obs.md) (rencana) + `cluster_obs.md` + README.
- [ ] Test — unit + E2E (ingest & alert).

### B.4 Fase 5 — Dokumen & Kolaborasi

#### `DOC` — Document
- [x] DB — `doc_document`, `doc_version`, `doc_sign`.
- [ ] Backend — skeleton `doc/`.
- [ ] Frontend — halaman `DOC/`.
- [ ] Docs — `cluster_doc.md`.
- [ ] Test.

### B.5 Fase 6 — Lanjutan Admin

Rencana rinci: [app_sys.md](app_sys.md) (lihat juga
[roadmap Fase 6](roadmap.md#fase-6--lanjutan-admin-rencana)).

- [ ] `APP06` — **Notification & Template**: dispatcher + channel/template/rule + log; halaman `APP06`.
- [ ] `APP07` — **Integration Hub (HRIS/SSO)**: HRIS sync + SSO/OIDC/LDAP; halaman `APP07`.
- [ ] `APP08` — **API Key & Webhook**: kunci API (scope) + webhook keluar + delivery/retry (HMAC); halaman `APP08`.
- [ ] `APP09` — **Audit & Report**: penampil audit + report tersimpan/ekspor; halaman `APP09`.
- [ ] `APP10` — **Preference & Branding**: preferensi user + setting company; halaman `APP10`.
- [ ] `APP11` — **Backup & Restore**: export/import konfigurasi + dry-run restore + jadwal `JMS`; halaman `APP11`.

---

## C. Backlog Lintas-Cutting

- [ ] Registrasi `UploadHandler` ke route (unggah berkas).
- [ ] SSO/OIDC (opsional).
- [ ] Notifikasi (email/webhook).
- [ ] Peningkatan retensi & pelaporan audit.
