# Susunan Modul Berdasarkan Urutan Data

> Urutan pembangunan modul **sebelum** stack fitur dibangun, mengikuti alur data:
> **Master Data → Data Transaksi → Data Log/Agent → Data Report**.
> Melengkapi [roadmap.md](roadmap.md) (fase fitur) & [checklist.md](checklist.md)
> (status per aplikasi). Rujukan skema: [database/README.md](../database/README.md).
>
> 🔗 Kembali ke [planning/README.md](README.md).
> Tabel kesiapan per modul: [status-modul.md](status-modul.md).

## 1. Prinsip

Data dibangun dari **yang paling stabil & menjadi rujukan** menuju **yang
paling turunan**:

| Tier | Definisi | Sifat | Contoh |
|---|---|---|---|
| **1. Master Data** | Katalog, referensi, konfigurasi, definisi. | Stabil, jadi rujukan tabel lain. | `amm_asset_type`, `net_device`, `vms_host`, `sec_rule`, `obs_check`, `bot_agent` |
| **2. Data Transaksi** | Operasi harian yang mengacu master. | Bertambah terus, punya siklus hidup. | `amm_asset_assignment`, `net_firewall_rule`, `pod_stack_revision`, `pam_session`, `tim_message`, `jms_run` |
| **3. Data Log / Agent** | Telemetri, event, audit — terutama hasil agen (`osc_auto`). | Apend-only, bervolume besar, ber-retensi. | `bot_heartbeat`, `obs_metric`, `net_syslog_event`, `sec_event`, `web_access_log` |
| **4. Data Report** | Agregasi/derivasi dari transaksi + log. | Dihitung ulang/rollup. | `app_report`, `obs_metric_rollup`, `net_availability`, `web_access_stat`, `sec_compliance_report` |

**Aturan urutan:**
1. **Master lebih dulu** — transaksi & log butuh FK/kode master.
2. **Transaksi sebelum log** — log mencatat kejadian transaksi/operasional.
3. **Log/Agent butuh agen** — aktifkan `osc_auto` + registrasi `bot_agent` + capability.
4. **Report paling akhir** — butuh data transaksi & log yang mengalir.
5. **Setiap modul dibangun bertahap M → T → L → R** (mengikuti tier).
6. **Master lintas-modul lebih dulu**: `APP06`–`APP08`/`APP10` (notifikasi,
   integrasi, api key/webhook, preferensi) dipakai hampir semua modul.

## 2. Fase Eksekusi

### Fase 0 — Platform & Master Inti (sudah selesai)

Prasyarat teknis + master inti yang sudah ada.

- **Stack**: `osc_base` (Prisma/Postgres), `osc_rest`, `osc_site`, `osc_auto` (agen, scaffold).
- **Aplikasi**: `PUB00` (auth), `APP00` (shell/nav), `APP01`–`APP05`
  (module, company, user, signature, session/token), `SYS01`–`SYS03`.
- **Model master inti**: `app_module`, `app_company`, `app_company_module`,
  `app_company_area`, `app_user*`, `app_user_privilege`, `app_signature_*`,
  `app_approval_step`, `app_employee`.

### Fase 1 — Master Data

Bangun **seluruh lapisan master** modul, dimulai dari konfigurasi lintas-modul.

| # | Modul | Model master utama |
|---|---|---|
| 1.1 | **APP (admin lanjutan)** | `app_notify_channel`, `app_notify_template`, `app_notify_rule`, `app_integration`, `app_api_key`, `app_webhook`, `app_preference`, `app_company_setting`, `app_backup_item` |
| 1.2 | **AMM** | `amm_asset_type`, `amm_asset_tag`, `amm_asset_device`, `amm_manufacturer`, `amm_asset_model`, `amm_department`, `amm_status_type`, `amm_status_label`, `amm_supplier`, `amm_store_account`, `amm_store_edc`, `amm_digital_signage`, `amm_custom_field`, `amm_fieldset*`, `amm_software`, `amm_kit`/`amm_kit_item`, `amm_accessory`/`amm_component`/`amm_consumable`, `amm_eula`, `amm_license`, `amm_contract`, `amm_asset`, `amm_api_token` |
| 1.3 | **NET** | `net_subnet`, `net_device`, `net_interface`, `net_device_group`, `net_vlan`, `net_ip_address`, `net_sensor`, `net_custom_oid`, `net_alert_rule`/`net_alert_rule_binding`, `net_topology_link`, `net_maintenance_window`, `net_entity_physical`, `net_blocklist`, `net_api_token`, `net_script` |
| 1.4 | **VMS** | `vms_host`, `vms_node`, `vms_cluster`, `vms_storage`, `vms_pool`, `vms_iso`, `vms_template`, `vms_sdn`, `vms_security_group`, `vms_ha`, `vms_passthrough`, `vms_nic`, `vms_guest` (record) |
| 1.5 | **WEB** | `web_server`, `web_vhost`, `web_certificate`, `web_upstream`, `web_domain`, `web_access_list`/`web_access_entry`, `web_acme_account`, `web_dns_provider`/`web_dns_record`, `web_location`, `web_stream`, `web_snippet`, `web_template` |
| 1.6 | **POD** | `pod_engine`, `pod_cluster`, `pod_node`, `pod_workload`, `pod_stack`, `pod_service`, `pod_image`, `pod_volume`, `pod_network`, `pod_env_var`, `pod_registry`/`pod_registry_repository`/`pod_registry_tag`, `pod_template`/`pod_template_registry`, `pod_git_credential`, `pod_pod`, `pod_container`, `pod_secret`, `pod_gpu`, `pod_heal_policy`, `pod_backup_schedule`/`pod_scan_schedule`, `pod_threat_intel`, `pod_log_setting`, `pod_notification_*`, `pod_api_key`, `pod_webhook` |
| 1.7 | **PAM** | `pam_asset`, `pam_account` (vault), `pam_policy`, `pam_account_template`, `pam_command_filter`/`pam_command_filter_binding`, `pam_approval_flow`/`pam_approval_step`, `pam_gateway`, `pam_login_acl`, `pam_lockout`, `pam_apikey`, `pam_ticket_provider`, `pam_grant` |
| 1.8 | **SEC** | `sec_agent`, `sec_agent_group`, `sec_rule`, `sec_decoder`, `sec_sca_policy`, `sec_vuln_feed`, `sec_intel_feed`/`sec_intel_ioc`, `sec_rule_feed`, `sec_cdb_list`/`sec_cdb_entry`, `sec_cloud_account`, `sec_forwarder`, `sec_log_source`, `sec_rbac_grant`, `sec_response_script`/`sec_response_action`, `sec_osquery_query` |
| 1.9 | **OBS** | `obs_system`, `obs_check`/`obs_check_group`, `obs_alert_rule`, `obs_notification`/`obs_notify_channel`, `obs_silence`, `obs_dashboard`, `obs_maintenance`, `obs_status_page`/`obs_status_page_item`, `obs_vmhost`/`obs_vm`, `obs_service` |
| 1.10 | **DOC / TIM / JMS / DSO / BOT** | `doc_folder`/`doc_quota`; `tim_account`; `jms_job`/`jms_schedule`; `dso_pipeline`; `bot_agent` (registrasi agen) |

### Fase 2 — Data Transaksi

Operasi harian yang mengacu master. Sekaligus **mengaktifkan agen** untuk
modul yang butuh (POD/NET/VMS/SEC/PAM/WEB via `osc_auto`).

| # | Modul | Model transaksi utama |
|---|---|---|
| 2.1 | **APP** | `app_user_session`, `app_user_token`, `app_approval_sign`, `app_notify_message`, `app_backup`, `app_announcement`/`app_announcement_read` |
| 2.2 | **AMM** | `amm_asset` lifecycle, `amm_asset_assignment`, `amm_asset_relation`, `amm_asset_request`, `amm_asset_audit`/`amm_audit_item`, `amm_maintenance`, `amm_license_seat`, `amm_contract_asset`, `amm_custom_value`, `amm_depreciation`, `amm_consumable_txn`, `amm_accessory_assignment`/`amm_accessory_txn`, `amm_component_assignment`, `amm_kit_checkout`, `amm_reservation`, `amm_eula_acceptance` |
| 2.3 | **NET** | `net_firewall_rule`, `net_config_backup`, `net_config_revision`, `net_change`, `net_discovery`, `net_block_entry`, `net_address_list_entry`, `net_alert` |
| 2.4 | **VMS** | provisioning `vms_guest`, `vms_snapshot`, `vms_backup`, `vms_task`, `vms_fw_rule`, `vms_replication` |
| 2.5 | **WEB** | `web_change`, `web_deploy`, `web_backup`, `web_config_revision` |
| 2.6 | **POD** | `pod_stack_revision`, `pod_build`, `pod_backup`, `pod_scan`, `pod_git_sync`, `pod_exec_session`, `pod_system_backup`, `pod_patch`, `pod_action` |
| 2.7 | **PAM** | `pam_session`, `pam_access_request`/`pam_access_request_approval`, `pam_discovery_job` |
| 2.8 | **SEC** | `sec_incident`/`sec_incident_event`, `sec_live_query` |
| 2.9 | **OBS** | `obs_alert`, `obs_import_job`, `obs_status_page_incident` |
| 2.10 | **DOC / TIM** | `doc_document`/`doc_version`/`doc_sign`, `doc_file`/`doc_file_version`/`doc_share`; `tim_room`/`tim_member`/`tim_message`/`tim_reaction`, `tim_email`/`tim_attachment` |
| 2.11 | **JMS / DSO / BOT** | `jms_run`; `dso_build`/`dso_deploy`; `bot_task` |

### Fase 3 — Data Log / Agent

Prasyarat: `osc_auto` (agen) + capability + endpoint `/rest/agent` +
registrasi `bot_agent`. Data apend-only, wajib retensi
(`osc_rest/backbone/retention.go`, dijalankan otomatis dari `main.go`;
env `RE_DAYS`/`RE_LOGS` + override `RE_DAYS_<TABEL>`). Rotasi log container
diatur `logging.options` di compose (`max-size`/`max-file`).

| # | Modul | Model log/agent utama |
|---|---|---|
| 3.1 | **BOT** | `bot_heartbeat`, hasil `bot_task` |
| 3.2 | **OBS** | `obs_metric`, `obs_log`, `obs_disk`, `obs_container_stat`, `obs_vm_stat`, `obs_check_result` |
| 3.3 | **NET** | `net_syslog_event`, `net_interface_stat`, `net_ping_result`, `net_firewall_event` |
| 3.4 | **SEC** | `sec_event`, `sec_event_alert`, `sec_waf_event`, `sec_fim_event`, `sec_sca_result`, `sec_vuln`, `sec_container_event`, `sec_malware_event`, `sec_cloud_finding`, `sec_syscollector_*` (11 tabel) |
| 3.5 | **VMS** | `vms_finding` (impor temuan), log `vms_task` |
| 3.6 | **POD** | `pod_scan_finding`, `pod_disk_usage`, `pod_update_check`, `pod_port_binding` |
| 3.7 | **WEB** | `web_access_log`, `web_server_metric` |
| 3.8 | **PAM** | `pam_health_check`, `pam_command` (log perintah sesi), rekaman `pam_session` |
| 3.9 | **APP / AMM** | `app_user_action` (audit), `app_webhook_delivery`, `app_integration_sync`; `amm_api_log` |

### Fase 4 — Data Report

Dihitung dari transaksi + log; butuh dashboard/ekspor.

| # | Modul | Model report utama |
|---|---|---|
| 4.1 | **APP** | `app_report` (`APP09` Audit & Report) |
| 4.2 | **OBS** | `obs_metric_rollup`, `obs_report`, status page (`obs_status_page*`), dashboard (`obs_dashboard`) |
| 4.3 | **NET** | `net_interface_stat_rollup`, `net_sensor_stat_rollup`, `net_availability`, `net_billing` |
| 4.4 | **WEB** | `web_access_stat` |
| 4.5 | **SEC** | `sec_compliance_report` (+ ringkasan insiden) |
| 4.6 | **POD** | risk scoring `pod_scan_finding`, `pod_update_check` |
| 4.7 | **AMM** | `amm_depreciation`, laporan aset/lisensi/garansi |

## 3. Ringkasan Urutan (Linear)

```text
Fase 0  Platform + master inti (APP00–05, SYS)                 [selesai]
Fase 1  Master Data
        1.1 APP06/07/08/10 (notifikasi, integrasi, apikey, preferensi)
        1.2 AMM master   1.3 NET master   1.4 VMS master
        1.5 WEB master   1.6 POD master   1.7 PAM master
        1.8 SEC master   1.9 OBS master   1.10 DOC/TIM/JMS/DSO/BOT master
Fase 2  Data Transaksi  (+ aktifkan agen osc_auto & capability)
        APP → AMM → NET → VMS → WEB → POD → PAM → SEC → OBS → DOC/TIM → JMS/DSO/BOT
Fase 3  Data Log / Agent (BOT heartbeat → OBS/NET/SEC/VMS/POD/WEB/PAM/APP/AMM)
Fase 4  Data Report (APP09, OBS, NET, WEB, SEC, POD, AMM)
```

## 4. Ketergantungan Kunci

- **Report** bergantung pada **Transaksi + Log** (tidak bisa lebih dulu).
- **Log/Agent** bergantung pada **Agen** (`osc_auto` + `bot_agent`) dan **Master**
  (device/asset/host/check).
- **Transaksi** bergantung pada **Master** (FK & kode).
- **Master lintas-modul** (notifikasi, apikey/webhook, preferensi, audit) sebaiknya
  lebih dulu agar modul lain bisa memakainya.
- **SEC** menerima umpan dari **WEB** (log nginx) & **NET** (syslog) — jadi ingest
  SEC ideal setelah log WEB/NET mengalir.
- **AMM** menjadi rujukan aset untuk **VMS/POD/NET/PAM** (relasi CMDB).

## 5. Definisi Selesai per Tier

- **Master**: CRUD + validasi + seed referensi + halaman list/form.
- **Transaksi**: alur bisnis end-to-end + audit (`app_user_action`) + status.
- **Log/Agent**: ingesti + retensi + tampilan realtime/historis.
- **Report**: agregasi terjadwal (`JMS`) + filter/ekspor + dashboard.
