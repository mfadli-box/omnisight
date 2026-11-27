# OmniSight (OSC) Re-Engineering Workflow & Micro-Prompt Master Plan

## 1. Arsitektur Sistem & Spesifikasi Platform

OmniSight (OSC) dirancang sebagai platform Site Reliability Engineering (SRE), Monitoring Telemetri, Privileged Access Management (PAM), dan DevSecOps terpadu berbasis arsitektur terdistribusi. Ekosistem ini dikembangkan dengan standar keamanan tinggi, enkripsi terpusat, serta pengujian terotomatisasi.

### Komponen Utama Ekosistem

* **`osc_base` (Database Layer)**: PostgreSQL 16+ sebagai *source of truth* utama dengan fitur *Monthly Range Partitioning* untuk tabel log (`log_*`) dan audit trail (`trx_audit_trail`), Valkey (penyimpan cache performa tinggi, manajemen sesi JWT, dan pub/sub event), serta MongoDB untuk penyimpanan log tidak terstruktur.
* **`osc_rest` (Backend Service Layer)**: Rest API dan WebSocket Server berbasis Rust dan RustFS yang menerapkan prinsip *Domain-Driven Design (DDD)* di bawah `osc_rest/src/domain/`. Menyediakan penanganan request non-blocking, validasi signature HMAC SHA-256, hashing Argon2id, enkripsi vault AES-256-GCM, serta middleware otorisasi terpusat.
* **`osc_site` (Frontend Layer)**: Web Console berbasis Next.js (TypeScript) dan Tailwind CSS yang menyediakan antarmuka interaktif seperti visualizer rack 42U, editor Compose YAML (Monaco Editor), terminal web interaktif (xterm.js), serta grid IPAM.
* **`osc_auto` (Agent & Scheduler Layer)**: Agent independen berbasis Golang 1.23+ yang dikompilasi secara statis (`CGO_ENABLED=0`) untuk berjalan di lingkungan OS Ubuntu 24.04 LTS dan Windows 11. Berfungsi mengumpulkan telemetri host via `gopsutil`, memantau kontainer, menjalankan scanner ARP/NDP, serta mengirimkan data terenkripsi HMAC SHA-256 (`X-Agent-Signature`).
* **`osc_docs` (QA & Testing Suite)**: Suite pengujian otomatis berbasis Python yang terbagi menjadi `test_flow` untuk validasi alur kerja fungsional dan `test_guard` untuk audit keamanan SecOps (WAF, RBAC, HMAC, PAM Vault, XXE).

---

## 2. Matriks Konsolidasi & Pembakukan Skema Database

Untuk meningkatkan performa query, normalisasi data, serta kepatuhan audit keamanan, beberapa tabel legacy telah direfaktorisasi dan dikonsolidasikan ke dalam skema terstruktur (`dat_*` untuk data master, `trx_*` untuk transaksi real-time, dan `log_*` untuk log terpartisi).

| Tabel Legacy / Lama | Tabel Pengganti Resmi | Sub-Modul & Peruntukan |
| :--- | :--- | :--- |
| `dat_license` | `dat_asset`, `dat_asset_category`, `dat_store_account` | AM01: Pemisahan aset fisik/lisensi dan akun digital merchant. |
| `dat_store_equipment` | `dat_store_telephony`, `dat_store_pos`, `dat_store_account`, `dat_store_edc`, `dat_store_digisign` | AM03: Pembagian 5 kategori spesifik perangkat operasional toko. |
| `log_http_access` | `log_security_guard`, `log_system_event`, `trx_audit_trail` | CM03/SE02: Pemisahan log ancaman WAF, log aplikasi, dan audit user. |
| `log_pam_session` | `trx_pam_session`, `log_pam_access`, `log_pam_command_audit` | SE01: Pemisahan sesi aktif real-time, log koneksi, dan keylogger TTY. |
| `dat_rack_device` | `dat_asset`, `dat_server`, `trx_rack_unit_assignment` | AM02: Inventaris hardware, spesifikasi host server, dan lokasi 42U. |
| `dat_snmp_oid_mapping` | `dat_snmp_oid_template` | MN03: Direktori master OID template per vendor perangkat jaringan. |
| `dat_escalation_policy` | `dat_alert_escalation`, `dat_sla_policy` | MN04/SD02: Eskalasi notifikasi alert dan kebijakan SLA insiden. |
| `dat_ipam_device` | `trx_ip_allocation`, `dat_server`, `dat_snmp_device` | NP02: Pelacakan binding IP/MAC real-time dan registri host. |
| `log_network_scan` | `trx_ip_allocation`, `log_uptime_check`, `log_security_guard` | NP02/MN02/SE02: Hasil scan ARP IPAM, probe uptime, dan WAF scan. |
| `log_ticket_activity` | `trx_ticket_history`, `trx_ticket_comment`, `trx_ticket_attachment`, `log_sla_breach_audit` | SD01/SD02: Mutasi tiket, komentar, lampiran, dan audit breach SLA. |

---

## 3. Katalog Micro-Prompt (MP) Agent Golang (`osc_auto`)

Golang Agent (`osc_auto`) dikembangkan secara modular melalui 20 Micro-Prompt (MP) yang tersebar di 8 kelompok modul utama. Setiap MP dilengkapi dengan perintah Fast Pre-Check Guard untuk memverifikasi kesiapan berkas sebelum kompilasi.

### Group CM: Core Engine, Identity & Governance
* **MP-CM01-AG**: Agent Host Identity Registration & Fingerprint Collector. Pre-check: `test -s osc_auto/internal/identity/collector.go`.
* **MP-CM02-AG**: Dynamic Multi-Tenant Tagging & Area Assignment Worker. Pre-check: `test -s osc_auto/internal/config/tenant_poller.go`.
* **MP-CM03-AG**: Local Log Rotation & OS logrotate Runner. Pre-check: `test -s osc_auto/internal/log/rotate_runner.go`.

### Group CT: Container Engine
* **MP-CT01-AG**: Host Docker Daemon Metrics & Container Event Monitor. Pre-check: `test -s osc_auto/internal/container/metrics.go`.
* **MP-CT02-AG**: TTY Terminal Process Isolation & Exec Relay Worker. Pre-check: `test -s osc_auto/internal/container/exec_relay.go`.

### Group MN: Monitoring & Telemetry
* **MP-MN01-01**: Cross-Platform Metrics Collector (CPU, RAM, Disk, Net) & HMAC Egress. Pre-check: `test -s osc_auto/internal/metrics/collector.go`.
* **MP-MN02-AG**: Synthetic Uptime, TCP Port & ICMP Ping Healthcheck Engine. Pre-check: `test -s osc_auto/internal/uptime/ping_worker.go`.
* **MP-MN03-AG**: Local SNMP Poller & Network Device Discovery Engine. Pre-check: `test -s osc_auto/internal/snmp/poller.go`.
* **MP-MN04-AG**: Host Incident Anomaly Evaluator & Local Alert Buffer Worker. Pre-check: `test -s osc_auto/internal/alert/evaluator.go`.

### Group SE: SecOps & Access Guard
* **MP-SE01-AG**: Bastion Local SSH/RDP Tunnel Agent & Proxy Worker. Pre-check: `test -s osc_auto/internal/pam/tunnel.go`.
* **MP-SE02-AG**: Host File Integrity Monitor (FIM) & Wazuh Log Forwarder Agent. Pre-check: `test -s osc_auto/internal/siem/fim_forwarder.go`.

### Group NP: Network & IPAM
* **MP-NP01-AG**: Nginx Config File Sync & Local Reload Agent Worker. Pre-check: `test -s osc_auto/internal/nginx/sync.go`.
* **MP-NP02-AG**: Local IPAM ARP/NDP Scanner & Rogue IP Discovery Agent. Pre-check: `test -s osc_auto/internal/ipam/arp_scanner.go`.

### Group AM: Asset Management & CMDB
* **MP-AM01-AG**: Local Hardware DMI/SMBIOS Auditor & License Inspector Agent. Pre-check: `test -s osc_auto/internal/asset/dmi_auditor.go`.
* **MP-AM02-AG**: Server Rack Sensor Telemetry (IPMI/Thermal/Power) Agent. Pre-check: `test -s osc_auto/internal/asset/ipmi_sensor.go`.
* **MP-AM03-AG**: Store POS Hardware & Payment EDC Healthcheck Agent. Pre-check: `test -s osc_auto/internal/asset/store_checker.go`.

### Group SD: ServiceDesk & Incidents
* **MP-SD01-AG**: Auto-Diagnostic Incident Snapshot Collector Agent. Pre-check: `test -s osc_auto/internal/sd/diagnostic_snapshot.go`.
* **MP-SD02-AG**: Unreachable Host SLA Breach Monitor Worker. Pre-check: `test -s osc_auto/internal/sd/sla_breach_worker.go`.

### Group AG: AI Gateway & Automation
* **MP-AG01-AG**: MCP Edge Tool Local Command Execution Runner. Pre-check: `test -s osc_auto/internal/ag/mcp_runner.go`.
* **MP-AG02-AG**: Local AI Work Log Collector & Directus Helper Worker. Pre-check: `test -s osc_auto/internal/ag/worklog_collector.go`.

---

## 4. Alur Kerja Operasional (Workflow) 19 Sub-Modul

Setiap sub-modul dirancang dengan alur kerja yang terintegrasi antara agen pengumpul, backend pemroses, dan antarmuka visualisasi.

### Group CM: Core Engine & Identity
1. **CM01 (Identity & HRIS Sync)**: Pengguna melakukan otentikasi melalui `osc_site`. Backend `osc_rest` memeriksa konfigurasi `dat_company`. Jika integrasi HRIS aktif, backend memanggil service XML ASMX HRIS dengan batas waktu 3 detik. Apabila service HRIS mengalami kegagalan atau timeout, sistem secara otomatis beralih ke Mode Pemulihan (Fallback Recovery) menggunakan password lokal `hris_backup_password` yang ter-hash Argon2id disertai notifikasi peringatan.
2. **CM02 (Tenant & Master Data)**: Mengelola struktur hierarki organisasi (`Company -> Area -> Store`). Pengguna diikat melalui tabel relasi `trx_user_company` dan `trx_user_area`. Middleware RBAC pada `osc_rest/src/middleware/rbac.rs` mengintersepsi seluruh request HTTP untuk menolak akses lintas tenant tanpa otorisasi (HTTP 403 Forbidden).
3. **CM03 (Audit Trail & Log Rotation)**: Setiap mutasi data dicatat oleh middleware audit ke `trx_audit_trail`. Tabel log terpartisi (`log_*`) yang telah berusia lebih dari 90 hari diarsipkan atau di-drop secara otomatis oleh worker rotasi.

### Group CT: Container & Orchestration
1. **CT01 (Docker Stack Engine)**: SRE mengelola berkas Docker Compose pada editor Monaco di `osc_site`. Backend `osc_rest` berkomunikasi dengan Docker Daemon via UNIX Socket (`/var/run/docker.sock`) menggunakan crate `bollard` untuk eksekusi deployment asynchronous.
2. **CT02 (Container Terminal & Images)**: Menyediakan koneksi WebSocket streaming untuk TTY terminal interaktif (`/ws/v1/containers/:id/exec`) dan pembersihan ruang disk melalui fitur Image Prune.

### Group MN: Monitoring & Telemetry
1. **MN01 (Lightweight Agent Metrics)**: Agen Golang `osc_auto` mengumpulkan metrik performa host setiap 10 detik. Payload dikirim ke endpoint `POST /api/v1/telemetry/agent` dengan signature HMAC SHA-256 (`X-Agent-Signature`). Backend memvalidasi signature dan timestamp untuk mencegah replay attack sebelum menyimpan data ke `log_agent_telemetry` dan memperbarui `trx_agent_heartbeat`.
2. **MN02 (Synthetic Uptime & SSL)**: Worker asynchronous backend mengeksekusi uji ketersediaan HTTP, socket TCP, ICMP ping, dan pemeriksaan masa berlaku sertifikat SSL, kemudian menyimpannya ke `trx_uptime_summary_daily`.
3. **MN03 (Enterprise SNMP)**: Engine SNMP melakukan polling OID berdasarkan template vendor (`dat_snmp_oid_template`) ke perangkat jaringan terdaftar (`dat_snmp_device`).
4. **MN04 (Central Alerting & Escalation)**: Event anomali dari MN01-MN03 dikirim ke Alert Engine untuk proses deduplikasi. Jika kondisi kritis bertahan melewati ambang batas, notifikasi dikirimkan ke saluran komunikasi (Telegram/Slack) sesuai aturan `dat_alert_escalation`.

### Group SE: SecOps & Access Guard
1. **SE01 (Privileged Access PAM)**: Kredensial SSH/RDP disimpan terenkripsi AES-256-GCM di `dat_pam_credential`. SRE membuka sesi terminal melalui proxy WebSocket (`/ws/v1/pam/ssh`) tanpa mengekspos kunci privat mentah ke browser. Aktivitas sesi dicatat pada `trx_pam_session` dan audit perintah pada `log_pam_command_audit`.
2. **SE02 (SIEM & WAF Guard)**: Middleware WAF (`waf_interceptor.rs`) mengintersepsi payload berbahaya (SQLi, XSS, XXE) dan memberikan respon pemblokiran HTTP 403 serta mencatat insiden ke `log_security_guard`.

### Group NP: Network & Proxy Management
1. **NP01 (Nginx Proxy Manager)**: Service `nginx_manager.rs` memvalidasi dan menggenerasi konfigurasi Virtual Host ke `/etc/nginx/sites-available/`, membuat symlink ke `sites-enabled`, serta melakukan reload Nginx.
2. **NP02 (IPAM & Network Map)**: Agent `osc_auto` mengeksekusi scanner ARP/NDP untuk memetakan IP dan MAC Address di jaringan lokal. Kalkulator IPAM (`ipam_service.rs`) mencatat alokasi di `trx_ip_allocation` dan mengidentifikasi perangkat asing (Rogue Devices).

### Group AM: Asset Management & CMDB
1. **AM01 (Hardware & Account Vault)**: Mengelola inventaris aset fisik `dat_asset` serta enkripsi kredensial akun merchant digital di `dat_store_account`.
2. **AM02 (DCIM & Rack Mapping)**: Visualisasi spasial penempatan unit server 42U (`trx_rack_unit_assignment`) dan pemetaan port daya PDU (`trx_rack_pdu_port`).
3. **AM03 (Store CMDB)**: Pemantauan 5 kategori peralatan cabang (`dat_store_telephony`, `dat_store_pos`, `dat_store_account`, `dat_store_edc`, `dat_store_digisign`) yang secara otomatis memicu tiket insiden ke SD01 jika peralatan kritis mengalami masalah.

### Group SD: ServiceDesk & Incidents
1. **SD01 (Incident Ticketing)**: Pengelolaan tiket insiden pada `trx_ticket_issue`, riwayat perubahan status pada `trx_ticket_history`, komentar pada `trx_ticket_comment`, dan lampiran berkas pada `trx_ticket_attachment`.
2. **SD02 (SLA & Escalation Manager)**: Pelacakan batas waktu respon dan penyelesaian tiket berdasarkan `dat_sla_policy` (`P1_CRITICAL` hingga `P4_LOW`). Keterlambatan dicatat pada `log_sla_breach_audit`.

### Group AG: AI Gateway & Automation
1. **AG01 (MCP Tool Gateway)**: Gateway router MCP (`osc_rest/src/mcp/router.rs`) mengarahkan eksekusi tool AI secara aman dan mencatat audit di `log_mcp_execution`.
2. **AG02 (Directus CMS Integration)**: Worker `osc_auto` mengumpulkan laporan kerja AI berbentuk Markdown dari `osc_note/` dan menyinkronkannya ke Directus CMS via `directus_sync.rs`.

---

## 5. Tahapan Eksekusi Pengujian QA & Security Testing

Proses pengujian otomatis pada komponen `osc_docs` dilaksanakan secara berurutan sesuai dependensi sistem:

1. **Tahap 1 — Backend & Core Security (`osc_rest` & `osc_base`)**:
   * Pengujian isolasi multi-tenant: `python3 osc_docs/test_flows/CM02-F.py`
   * Pengujian aturan pemblokiran WAF: `python3 osc_docs/test_guard/SE02-G.py`
   * Pengujian enkripsi PAM Vault: `python3 osc_docs/test_guard/SE01-G.py`
2. **Tahap 2 — Agent Telemetry & Ingestion (`osc_auto`)**:
   * Validasi autentikasi signature HMAC: `python3 osc_docs/test_guard/MN01-G.py`
   * Pengujian deteksi Rogue IP IPAM: `python3 osc_docs/test_flows/MN02-F.py`
3. **Tahap 3 — Frontend & End-to-End Workflow (`osc_site`)**:
   * Pengujian stabilitas WebSocket Terminal: `python3 osc_docs/test_flows/CT02-F.py`
   * Pengujian alokasi rack DCIM: `python3 osc_docs/test_flows/AM02-F.py`
   * Pengujian lifecycle insiden ticketing: `python3 osc_docs/test_flows/SD01-F.py`
