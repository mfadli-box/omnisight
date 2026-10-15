# Roadmap — Peta Jalan Aplikasi

> Perencanaan bertahap aplikasi OmniSight. Setiap aplikasi mengikuti
> [blueprint](blueprint.md) dan konvensi modul. Status diperbarui di
> [checklist.md](checklist.md).

## Ringkasan Fase

| Fase | Tema | Aplikasi | Status |
|---|---|---|---|
| 0 | Fondasi stack | `osc_base`, `osc_rest`, `osc_site`, docs, test | Selesai |
| 1 | Core platform & identitas | `APP00`–`APP05`, `SYS01`–`SYS03`, `PUB00` | Selesai |
| 2 | Manajemen aset & inventaris | `AMM`, `NET`, `VMS`, `POD` | DB selesai · runtime `POD`/`VMS` rencana |
| 3 | Keamanan & Akses | `WAF`, `SEC` (Wazuh-like), `PAM` (Bastion/PAM), `WEB`, `VMS` (findings) | DB selesai · SIEM/Bastion rencana |
| 4 | Operasional & otomasi | `JMS`, `BOT`, `DSO`, `OBS` | DB selesai |
| 5 | Dokumen & kolaborasi | `DOC` | DB selesai |
| 6 | Lanjutan admin | `APP06`–`APP11` | DB selesai |

> **Status lapisan DB: lengkap.** Seluruh cluster (`cluster_*.prisma`) + field
> perluasan sudah terpasang (304 model di 14 cluster). Fase 2–7 kini berada
> pada tahap **implementasi backend + frontend**, bukan lagi perencanaan skema.
> Lihat [database/README.md](../database/README.md).

---

## Fase 0 — Fondasi Stack (Selesai)

Deliverable: tiga komponen dasar berjalan, migrasi & seed, dokumentasi teknis,
dan test unit Python.

- `osc_base`: skema Prisma (`cluster_app.prisma`), migrasi init, seed admin +
  modul.
- `osc_rest`: Gin + `mechanic` (error/pagination), middleware auth, retention,
  upload (utas).
- `osc_site`: App Router, proxy `/proxy/*`, layout board, sidebar dinamis.
- `osc_docs`: dokumentasi teknis + test (`testing/`).

## Fase 1 — Core Platform & Identitas (Selesai)

| Aplikasi | Kode | Cakupan |
|---|---|---|
| Navigation & Auth | `APP00`, `PUB00` | Login/logout, daftar company, pohon modul. |
| Module | `APP01` | CRUD modul (hierarki `parent_id`). |
| Company | `APP02` | CRUD company + tautan modul + area. |
| User | `APP03` | CRUD user + company + privilege + area. |
| Signature | `APP04` | Tipe/langkah/penandatangan + form/flag persetujuan. |
| Session | `APP05` | Sesi login, token otentikasi, audit aksi. |
| Session Profile | `SYS01`–`SYS03` | Profil, ubah password, riwayat. |

Layanan pendukung selesai: `applink` (auto-link), `USLogs` (audit), `USRole`
(privilege), pohon menu dengan aturan parent non-`HIDE`.

---

## Fase 2 — Manajemen Aset & Inventaris (DB selesai · implementasi rencana)

Tujuan: inventaris infrastruktur yang dapat dipetakan dari berbagai sumber.

| Prefix | Aplikasi | Cakupan usulan | Model usulan | Dependensi |
|---|---|---|---|---|
| `AMM` | Asset Management & CMDB | Daftar aset/lokasi, siklus hidup, penugasan/mutasi, **relasi CMDB**, **lisensi & software**, **garansi/maintenance**, **label QR/barcode**, **custom fields**, **supplier & kontrak**, **consumables**, **permintaan aset (approval)**; halaman lokasi-asat (POS, signage, akun toko, EDC; lihat [additional.md](additional.md)) + export Excel. **Paritas Snipe-IT (MAJOR)**: **asset models**, **fieldsets**, **audit inventaris tahunan**, **depresiasi & EOL**; manufacturers, departments, status labels, accessories/components/kits, reservations, EULA, bulk edit, alert stok, requestable, API token. Rencana rinci: [app_amm.md](app_amm.md). | `amm_asset`, `amm_asset_type`, `amm_asset_tag`, `amm_asset_device`, `amm_digital_signage`, `amm_store_account`, `amm_store_edc` + `amm_asset_assignment`, `amm_asset_relation`, `amm_license`, `amm_license_seat`, `amm_software`, `amm_maintenance`, `amm_custom_field`, `amm_custom_value`, `amm_supplier`, `amm_contract`, `amm_contract_asset`, `amm_consumable`, `amm_consumable_txn`, `amm_asset_request`, `amm_asset_model`, `amm_manufacturer`, `amm_fieldset`, `amm_fieldset_field`, `amm_fieldset_binding`, `amm_asset_audit`, `amm_audit_item`, `amm_depreciation`, `amm_department`, `amm_status_type`, `amm_status_label`, `amm_accessory`, `amm_accessory_assignment`, `amm_accessory_txn`, `amm_component`, `amm_component_assignment`, `amm_kit`, `amm_kit_item`, `amm_kit_checkout`, `amm_reservation`, `amm_eula`, `amm_eula_acceptance`, `amm_api_token`, `amm_api_log` | `APP02` (company/area); `APP04` (approval); `VMS`/`NET`/`POD`/`PAM` (tautan) |
| `NET` | Network & MikroTik (firewall) | Inventaris jaringan + **manajemen MikroTik** (firewall: filter/NAT/mangle/raw + address-list, clone/reset, time-based, backup `.rsc`/`.backup`, audit + rollback, **hardening**); **SNMP ala LibreNMS** (trafik/error per interface, sensor health/suhu/fan/PSU, optik SFP DDM/DOM, PoE, trap/syslog, topologi L2, rollup, discovery subnet/SNMP); **paritas LibreNMS**: alerting rules + transport, ambang per-sensor/port, device/port groups, billing/95th, availability/SLA, riwayat sensor, VLAN, IP address, inventory ENTITY-MIB, maintenance window, config search, custom MIB, API token. Akses **via agen** `osc_auto/agent_vm` (API biner + REST v7). ⏸️ VPN, auto-block/threat feed, MNDP/RoMON, scripts, torch — ditangguhkan. Rencana rinci: [app_net.md](app_net.md). | `net_subnet`, `net_device`, `net_interface` + `net_firewall_rule`, `net_address_list_entry`, `net_config_backup`, `net_change`, `net_firewall_event`, `net_interface_stat`, `net_interface_stat_rollup`, `net_sensor`, `net_sensor_stat_rollup`, `net_syslog_event`, `net_topology_link`, `net_discovery`, `net_device_group`, `net_alert_rule`, `net_alert`, `net_maintenance_window`, `net_billing`, `net_availability`, `net_ping_result`, `net_vlan`, `net_ip_address`, `net_entity_physical`, `net_config_revision`, `net_custom_oid`, `net_api_token` | `AMM`; `BOT` (agent); `OBS` (transport alert) |
| `VMS` | VM & Hypervisor Management | **Manajemen VM**: inventaris + power lifecycle, snapshot, clone, resize, console (noVNC; SPICE opsional), tasks; **provisioning** (create VM dari ISO/template + cloud-init user-data/meta/network, NIC/bridge/VLAN/SDN, storage pool & ISO library, backup/restore VM + retensi/verifikasi/enkripsi); **temuan keamanan** (impor dari `SEC`). **Paritas Proxmox/Incus (MAJOR)**: **firewall per-VM + security group**, SDN, resource pool, **cluster/HA/replikasi**, hotplug, PCI/USB passthrough, disk move, guest-agent exec, bulk power. Non-goal: live migration (snapshot+clone saja). Hypervisor prioritas **Incus/LXD**. Rencana rinci: [app_vms.md](app_vms.md). | `vms_host`, `vms_guest`, `vms_finding` + `vms_snapshot`, `vms_task`, `vms_template`, `vms_nic`, `vms_storage`, `vms_iso`, `vms_backup`, `vms_fw_rule`, `vms_security_group`, `vms_sdn`, `vms_pool`, `vms_cluster`, `vms_node`, `vms_ha`, `vms_replication`, `vms_passthrough` | `AMM`; `BOT`/agen, `OBS` (metrik), `SEC` (temuan) |
| `POD` | Container/Pod (K8s + Docker/Podman) | **Kubernetes** (cluster/node/workload) **+ runtime Docker/Podman** (pengganti Dockge & Arcane: project Compose, Git Sync/GitOps, container, image + build, volume/network + backup, vulnerability scan, templates, terminal, log realtime, multi-environment); **paritas Arcane**: auto-update (digest/semver) + event check, patch image (Copacetic), scan terjadwal + risk scoring/KEV/EPSS, backup terjadwal + system backup, auto-heal, browse registry, topologi/ports, GPU, log terstruktur, notifikasi+template, API key scoped+OpenAPI, CLI, volume file browser. Non-goal: Swarm. Rencana rinci: [app_pod.md](app_pod.md). | K8s: `pod_cluster`, `pod_node`, `pod_workload`. Runtime: `pod_engine`, `pod_stack`, `pod_stack_revision`, `pod_service`, `pod_container`, `pod_image`, `pod_volume`, `pod_network`, `pod_registry`, `pod_action`, `pod_env_var`, `pod_git_credential`, `pod_git_sync`, `pod_build`, `pod_backup`, `pod_scan`, `pod_scan_finding`, `pod_template`, `pod_template_registry`, `pod_exec_session`, `pod_pod`, `pod_secret`, `pod_disk_usage`, `pod_update_check`, `pod_heal_policy`, `pod_backup_schedule`, `pod_system_backup`, `pod_patch`, `pod_scan_schedule`, `pod_threat_intel`, `pod_registry_repository`, `pod_registry_tag`, `pod_port_binding`, `pod_gpu`, `pod_notification_channel`, `pod_notification_template`, `pod_log_setting`, `pod_api_key`, `pod_webhook` | `AMM`; `BOT` (agent), `DSO` (image build), `APP06` (notifikasi) |

Prinsip: data telemetri ber-retensi (lihat `retention.go`), data referensi
bersifat persisten.

## Fase 3 — Keamanan, Akses & Web (DB selesai · implementasi rencana)

| Prefix | Aplikasi | Cakupan usulan | Model usulan | Dependensi |
|---|---|---|---|---|
| `WAF` | Web Application Firewall | Aturan, event blokir, tanda tangan serangan (perimeter). | `sec_waf_rule`, `sec_waf_event` | `NET`, `WEB` |
| `SEC` | Security Operations / SIEM (ala Wazuh) | **HIDS/FIM/SCA/SIEM**: agen keamanan, log+decoder+rule, FIM (who-data/diff/registry), CIS, kerentanan host, insiden, active response (script/timeout/revert), compliance; **ingest log `WEB`/nginx & syslog `NET`**; **upgrade agen jarak jauh**, **feed ruleset**, **threat intel (VirusTotal/MISP)**, **log forwarding**. **Paritas Wazuh (MAJOR)**: **syscollector** (inventaris HW/SW/port), **rule DSL** (if_sid/frequency/list/PCRE2), CDB, malware (YARA/ClamAV/Defender), vuln feed, Docker runtime, osquery, auditd, live query, agent groups, compliance mapping, logtest, Windows EventChannel/Sysmon, cloud/CSPM, fine RBAC, MITRE sub-teknik. Non-goal: OpenSearch (pakai PostgreSQL). Agen capability `security`. Rencana rinci: [app_sec.md](app_sec.md). | `sec_agent`, `sec_decoder`, `sec_rule`, `sec_event`, `sec_event_alert`, `sec_fim_event`, `sec_sca_policy`, `sec_sca_result`, `sec_vuln`, `sec_incident`, `sec_incident_event`, `sec_response_action`, `sec_compliance_report`, `sec_log_source`, `sec_rule_feed`, `sec_intel_feed`, `sec_intel_ioc`, `sec_forwarder`, `sec_syscollector_hardware`, `sec_syscollector_os`, `sec_syscollector_package`, `sec_syscollector_iface`, `sec_syscollector_port`, `sec_syscollector_process`, `sec_syscollector_user`, `sec_syscollector_group`, `sec_syscollector_service`, `sec_syscollector_hotfix`, `sec_syscollector_browser_ext`, `sec_agent_group`, `sec_cdb_list`, `sec_cdb_entry`, `sec_malware_event`, `sec_vuln_feed`, `sec_container_event`, `sec_osquery_query`, `sec_live_query`, `sec_response_script`, `sec_rbac_grant`, `sec_cloud_account`, `sec_cloud_finding` | `VMS`, `NET`, `WEB`, `OBS`, `BOT` |
| `PAM` | Bastion / Privileged Access (ala JumpServer) | **Gateway SSH/SFTP/RDP/VNC**: credential vault, RBAC per-aset, perekaman+replay sesi, live monitor/shadow, command filter, approval, access request; **SSH gateway native**, **MFA per koneksi (TOTP/WebAuthn/RADIUS)**, **watermark**, **reason wajib**, rotasi kredensial. **Paritas JumpServer**: **login ACL bastion (MAJOR)**, **kontrol clipboard (MAJOR)**, share sesi, command log store pluggable, account template, bulk import/export, tiket eksternal, approval multi-level, idle timeout, lockout/cap sesi, native RDP, discovery, API key, health check. Non-goal: Telnet. Proxy di `osc_rest`, agen = relay. Rencana rinci: [app_pam.md](app_pam.md). | `pam_asset`, `pam_account`, `pam_policy`, `pam_grant`, `pam_command_filter`, `pam_session`, `pam_command`, `pam_access_request`, `pam_gateway`, `pam_login_acl`, `pam_lockout`, `pam_account_template`, `pam_command_filter_binding`, `pam_approval_flow`, `pam_approval_step`, `pam_access_request_approval`, `pam_apikey`, `pam_health_check`, `pam_discovery_job`, `pam_ticket_provider` | `AMM`, `VMS`, `NET`, `POD`, `SEC`, `APP04` |
| `WEB` | Web Server/Proxy + Domain & DNS (ala Nginx UI) | Site/vhost, reverse proxy, **stream L4**, upstream, access-list, editor config + safe apply; **TLS/ACME auto-renew** (HTTP-01/DNS-01, wildcard); **domain & DNS/DDNS (WHOIS expiry, record via provider)**; **analitik log akses/error + live tail**. **Paritas Nginx UI/NPM**: tuning lanjutan (WS/HSTS/redirect/location), wizard, snippet/template, metrik node, upgrade nginx, backup/export-import, cluster deploy, dead/404, static files, reverse index, panel auth. Rencana rinci: [app_web.md](app_web.md). | `web_vhost`, `web_certificate`, `web_upstream` + `web_server`, `web_stream`, `web_access_list`, `web_access_entry`, `web_acme_account`, `web_dns_provider`, `web_domain`, `web_dns_record`, `web_config_revision`, `web_change`, `web_access_log`, `web_access_stat`, `web_location`, `web_snippet`, `web_template`, `web_server_metric`, `web_backup`, `web_deploy` | `NET`, `OBS`, `WAF`, `SEC`, `JMS` |

## Fase 4 — Operasional & Otomasi (DB selesai · implementasi rencana)

| Prefix | Aplikasi | Cakupan usulan | Model usulan | Dependensi |
|---|---|---|---|---|
| `JMS` | Job Management | Definisi job, jadwal, run history, retry. | `jms_job`, `jms_schedule`, `jms_run` | `BOT`/agent |
| `BOT` | Bot/Agent | Registrasi agent, heartbeat, task queue. | `bot_agent`, `bot_heartbeat`, `bot_task` | `USBots()` |
| `DSO` | DevOps/CI-CD | Pipeline, build, deploy, environment. Dipakai `POD` untuk **image build** (lihat [app_pod.md](app_pod.md)). | `dso_pipeline`, `dso_build`, `dso_deploy` | repo/VCS |
| `OBS` | Observability (monitoring ala Beszel + uptime-kuma) | Hub + agent: metrik host & container (Docker/Podman), **VM host & guest** (hypervisor, prioritas **Incus/LXD**), **systemd service**, data historis, alert, notifikasi (kanal diperluas), network probe (grup/dependensi, tag, retry, Prometheus), **status page publik** + insiden/pengumuman, **maintenance window**, **cert/domain expiry**, real-time ~1s, impor Uptime Kuma, **ekspor Prometheus** (`/rest/metrics`). **Paritas Beszel/Uptime-Kuma**: disk tambahan (Btrfs/eMMC/mdraid), health/restart container, check WS/DB-engine/SMTP/Radius + opsi HTTP/proxy. Rencana rinci: [app_obs.md](app_obs.md). | `obs_metric`, `obs_log`, `obs_alert` + `obs_system`, `obs_metric_rollup`, `obs_disk`, `obs_container_stat`, `obs_vmhost`, `obs_vm`, `obs_vm_stat`, `obs_check`, `obs_check_group`, `obs_check_result`, `obs_alert_rule`, `obs_notification`, `obs_notify_channel`, `obs_silence`, `obs_dashboard`, `obs_report`, `obs_maintenance`, `obs_status_page`, `obs_status_page_item`, `obs_service`, `obs_status_page_incident`, `obs_import_job` | `NET`, `POD`, `VMS`, `WEB`, `BOT` |

Endpoint agen memakai grup `/rest/agent` (`USBots()`) yang telah disiapkan.

## Fase 5 — Dokumen & Kolaborasi (DB selesai · implementasi rencana)

| Prefix | Aplikasi | Cakupan usulan | Model usulan | Dependensi |
|---|---|---|---|---|
| `DOC` | Document | Repositori dokumen, versi, tanda tangan. | `doc_document`, `doc_version`, `doc_sign` | `APP04` |

## Fase 6 — Lanjutan Admin (DB selesai · implementasi rencana)

Rentang `APP06`–`APP11` berisi **layanan admin bersama**. Rencana rinci:
[app_sys.md](app_sys.md).

| Kode | Aplikasi | Cakupan usulan | Model usulan | Dependensi |
|---|---|---|---|---|
| `APP06` | Notification & Template | Kanal (email/SMTP, webhook, Telegram/Slack), template pesan, aturan routing; **dispatcher notifikasi lintas-modul**. | `app_notify_channel`, `app_notify_template`, `app_notify_rule`, `app_notify_message` | OBS, JMS, SEC, PAM, AMM, WEB |
| `APP07` | Integration Hub (HRIS/SSO) | Sinkronisasi HRIS (karyawan/jabatan/area), SSO/OIDC/LDAP, pemetaan ke `app_user`. | `app_integration`, `app_integration_sync`, `app_employee` | `APP03`, `APP02`, `JMS` |
| `APP08` | API Key & Webhook | Kunci API programatik (scope) + langganan webhook keluar + log/retry (HMAC). | `app_api_key`, `app_webhook`, `app_webhook_delivery` | `APP03`, `BOT` |
| `APP09` | Audit & Report | Penampil audit (`app_user_action`), laporan aktivitas/ekspor, report tersimpan. | `app_report` (+ `app_user_action`) | `APP05`, semua modul |
| `APP10` | Preference & Branding | Preferensi UI per-user + pengaturan per-company (tema, logo, lokalisasi, default). | `app_preference`, `app_company_setting` | `APP00`, `APP02`, `APP03` |
| `APP11` | Backup & Restore | Backup konfigurasi/metadata (export/import), jadwal via `JMS`, restore dengan dry-run. | `app_backup`, `app_backup_item` | `JMS`, seluruh cluster |

Kode final ditetapkan saat aplikasi mulai dikerjakan.

## Fase 7 — File Manager & Kolaborasi (DB selesai · implementasi rencana)

Menutup gap [gap-analysis.md](gap-analysis.md): manajemen berkas pengguna,
chat internal, mail mandiri, dan pengumuman/news. Rencana rinci:
[app_collab.md](app_collab.md). **DB sudah dibangun**; backend/frontend menyusul.

| Kode | Aplikasi | Cakupan usulan | Model usulan |
|---|---|---|---|
| `DOC` (perluas) | File Manager | Folder/berkas, versi, share, kuota, preview, scan, S3 | `doc_folder`, `doc_file`, `doc_file_version`, `doc_share`, `doc_quota` |
| `TIM` | Tim & Kolaborasi | Chat (kanal/DM, pesan realtime WS, lampiran, read-state) + Mail (kotak masuk/keluar + SMTP mandiri) | `tim_room`, `tim_member`, `tim_message`, `tim_reaction`, `tim_account`, `tim_email`, `tim_attachment` |
| `NEWS` | Announcement/News | Pengumuman internal + read-tracking | `app_announcement`, `app_announcement_read` |

---


## Kriteria "Selesai" (Definition of Done)

Sebuah aplikasi dianggap selesai bila memenuhi seluruh poin di
[checklist](checklist.md#definition-of-done): model + migrasi, skeleton
backend + route, halaman frontend, dokumentasi, dan test.
