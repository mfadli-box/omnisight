# OmniSight (OSC) — Master Implementation Checklist

Dokumen ini adalah **Master Checklist** awal (Pristine State) untuk melacak status implementasi 19 sub-modul OmniSight dari 0%. Semua micro-prompt belum dimulai dan siap dieksekusi satu per satu mulai dari `MP-CM01-BE`.

---

## 📊 Status Ringkasan Progress Global (Fresh Start)

- **Total Sub-Modul**: 19 Sub-Modul
- **Total Milestone Items**: 76 Items (4 Phase per Sub-Modul)
- **Status Overall**:
  - `[x]` Completed: 0 Items
  - `[/]` In Progress: 0 Items
  - `[ ]` Pending: 76 Items

---

## 1. Group CM: Core Engine, Identity & Governance

### CM01: Identity, Access & HRIS Auth Sync
- [ ] **Phase 1 (DB)**: Skema `dat_company.hris_login_url`, `has_hris_link`, `is_mfa_active`, `dat_user.hris_backup_password` & `log_hris_auth_sync`.
- [ ] **Phase 2 (Rust)**: Client HTTP `reqwest`, parser XML `quick-xml` (anti-XXE), Fallback Recovery engine ke `hris_backup_password`.
- [ ] **Phase 3 (Next.js)**: Form Login Multi-Company, Modal MFA TOTP, Toast Notification Recovery Mode.
- [ ] **Phase 4 (QA/Sec)**: Pengujian unit test `test_flows/CM01.py` (Local, HRIS Success, HRIS Rejected, Fallback Recovery, Anti-XXE).

### CM02: Tenant & Master Data Management
- [ ] **Phase 1 (DB)**: Tabel `dat_company`, `dat_area`, `dat_store`, `dat_employee`, `dat_user`, `dat_role`, `dat_permission`, `dat_menu`, `trx_user_company`, `trx_user_area`.
- [ ] **Phase 2 (Rust)**: Service Tenant CRUD & Middleware Auth RBAC/ABAC di `osc_rest`.
- [ ] **Phase 3 (Next.js)**: Component `SearchableCombobox` (anti-UUID mentah) & Grid Editor Permission RBAC.
- [ ] **Phase 4 (QA/Sec)**: Test pengujian isolasi tenant (`test_flows/CM02.py`).

### CM03: Audit Trail, Global Settings & Log Rotation Engine
- [ ] **Phase 1 (DB)**: Skema `trx_audit_trail`, `trx_job_execution`, fungsi auto-partitioning PostgreSQL `log_*`.
- [ ] **Phase 2 (Rust)**: Audit trail interceptor/middleware & log streamer `osc_rest`.
- [ ] **Phase 3 (Next.js)**: Dashboard Viewer Audit Log (Filter Date, User, Action, Export CSV).
- [ ] **Phase 4 (QA/Sec)**: Verifikasi fungsi rotasi log 90 hari & `logrotate` OS Ubuntu (`test_flows/CM03.py`).

---

## 2. Group CT: Container & Orchestration

### CT01: Docker Compose & Stack Engine
- [ ] **Phase 1 (DB)**: Stack `docker-compose.yml` & registri container stack di database.
- [ ] **Phase 2 (Rust)**: Docker API Engine wrapper (`bollard` crate) & WebSocket log tailing.
- [ ] **Phase 3 (Next.js)**: Editor YAML Stack (Monaco Editor) & status badge container.
- [ ] **Phase 4 (QA/Sec)**: Test pencegahan Command Injection pada Compose (`test_guard/CT01.py`).

### CT02: Container Terminal, Logs & Image Management
- [ ] **Phase 1 (DB)**: Log eksekusi container & audit prunning di `trx_job_execution`.
- [ ] **Phase 2 (Rust)**: WebSocket handler untuk interactive TTY shell execution (`docker exec -it`).
- [ ] **Phase 3 (Next.js)**: Terminal UI Component berbasis `xterm.js` dengan dark theme & log tail auto-scroll.
- [ ] **Phase 4 (QA/Sec)**: Test kestabilan session WebSocket under stress load (`test_flows/CT02.py`).

---

## 3. Group MN: Monitoring & Telemetry

### MN01: Lightweight Agent Metrics (Golang)
- [ ] **Phase 1 (DB)**: Master `dat_server`, `dat_agent_config`, partisi `log_agent_telemetry`.
- [ ] **Phase 2 (Rust/Go)**: Engine agent `osc_auto` (Golang) pengirim telemetri CPU, RAM, Disk, Net via HMAC header.
- [ ] **Phase 3 (Next.js)**: Chart Real-time Telemetry (Recharts/Chart.js) per Server Node.
- [ ] **Phase 4 (QA/Sec)**: Verification validasi HMAC signature agent (`test_guard/MN01.py`).

### MN02: Synthetic Uptime, Ping & SSL Checker
- [ ] **Phase 1 (DB)**: Master target monitor HTTP/Ping/SSL di `dat_uptime_target`.
- [ ] **Phase 2 (Rust)**: Async worker ping/HTTP checker dengan SSL certificate expiry alert.
- [ ] **Phase 3 (Next.js)**: Status Page Uptime & latency heatmap bar.
- [ ] **Phase 4 (QA/Sec)**: Test deteksi SSL Expired & alert trigger (`test_flows/MN02.py`).

### MN03: Enterprise Infrastructure & SNMP Monitoring
- [ ] **Phase 1 (DB)**: Skema OID SNMP & IP Device Target di `dat_snmp_device`.
- [ ] **Phase 2 (Rust)**: Worker SNMP poller (v2c/v3) untuk Switch/Router/UPS.
- [ ] **Phase 3 (Next.js)**: Topologi jaringan & visualisasi traffic port interface.
- [ ] **Phase 4 (QA/Sec)**: Test dekode SNMP PDU (`test_flows/MN03.py`).

### MN04: Central Alerting, Thresholds & Escalation Matrix
- [ ] **Phase 1 (DB)**: Skema `trx_alert_history` & `trx_summary_daily`.
- [ ] **Phase 2 (Rust)**: Rules engine evaluator (CPU > 90%, HRIS Down) -> Notification Push (Email/Telegram/Webhook).
- [ ] **Phase 3 (Next.js)**: Alert Manager Board (Firing, Acknowledged, Resolved).
- [ ] **Phase 4 (QA/Sec)**: Test simulasi eskalasi insiden (`test_flows/MN04.py`).

---

## 4. Group SE: SecOps & PAM (Privileged Access Management)

### SE01: Privileged Access (PAM) & Bastion Web Terminal
- [ ] **Phase 1 (DB)**: Vault credential server terenkripsi AES-256-GCM di `dat_server_credential`.
- [ ] **Phase 2 (Rust)**: Bastion Web SSH/RDP proxy engine dengan session recording.
- [ ] **Phase 3 (Next.js)**: Browser SSH Terminal & audit playback player.
- [ ] **Phase 4 (QA/Sec)**: Penetrasi anti-leak credential SSH (`test_guard/SE01.py`).

### SE02: SIEM, Threat Detection & Compliance Guard
- [ ] **Phase 1 (DB)**: Tabel partisi `log_security_guard`.
- [ ] **Phase 2 (Rust)**: WAF log analyzer & detector pola serangan (SQLi, XXE, Brute Force).
- [ ] **Phase 3 (Next.js)**: Security Command Center Dashboard & IP Blocking Manager.
- [ ] **Phase 4 (QA/Sec)**: Test serangan sintetis WAF (`test_guard/SE02.py`).

---

## 5. Group NP: Network & Reverse Proxy

### NP01: Nginx Reverse Proxy, Domain & SSL Manager
- [ ] **Phase 1 (DB)**: Registri Virtual Host & upstream proxy di `dat_nginx_vhost`.
- [ ] **Phase 2 (Rust)**: Auto-generator Nginx vhost config & Let's Encrypt ACME Client.
- [ ] **Phase 3 (Next.js)**: Proxy Host Form Editor & SSL Renewal Trigger.
- [ ] **Phase 4 (QA/Sec)**: Test sintaks config Nginx anti-broken (`test_flows/NP01.py`).

### NP02: IPAM & Network Source of Truth
- [ ] **Phase 1 (DB)**: Master Subnet, VLAN, dan alokasi IP Address di `dat_ip_subnet`.
- [ ] **Phase 2 (Rust)**: IP Address discovery scanner & conflict detector.
- [ ] **Phase 3 (Next.js)**: Visual Matrix Subnet & Utilization Chart.
- [ ] **Phase 4 (QA/Sec)**: Test simulasi pendeteksian IP Conflict (`test_flows/NP02.py`).

---

## 6. Group AM: Asset & CMDB (Configuration Management Database)

### AM01: IT Asset & Hardware/License Inventory
- [ ] **Phase 1 (DB)**: Tabel `dat_store_telephony`, `dat_store_pos`, `dat_store_account`.
- [ ] **Phase 2 (Rust)**: Service pencatatan depresiasi aset & QR Code label generator.
- [ ] **Phase 3 (Next.js)**: Asset Inventory Table with Barcode Scanner UI.
- [ ] **Phase 4 (QA/Sec)**: Test kalkulasi depresiasi aset (`test_flows/AM01.py`).

### AM02: DCIM & Rack Infrastructure Mapping
- [ ] **Phase 1 (DB)**: Master Data Center, Data Hall, dan Rack Unit (1U-42U) di `dat_rack_frame`.
- [ ] **Phase 2 (Rust)**: Service kalkulasi konsumsi daya (Watts) & space rack.
- [ ] **Phase 3 (Next.js)**: Drag-and-Drop Visual 42U Server Rack Layout.
- [ ] **Phase 4 (QA/Sec)**: Test validasi insersi rack unit clash (`test_flows/AM02.py`).

### AM03: Store & Equipment CMDB
- [ ] **Phase 1 (DB)**: Tabel `dat_store_edc`, `dat_store_digisign`.
- [ ] **Phase 2 (Rust)**: Service pendaftaran hardware per cabang/store.
- [ ] **Phase 3 (Next.js)**: Store Equipment Map & Health Status per Cabang.
- [ ] **Phase 4 (QA/Sec)**: Test kuery CMDB multi-store (`test_flows/AM03.py`).

---

## 7. Group SD: Service Desk & Ticketing

### SD01: Incident & Service Request Ticketing
- [ ] **Phase 1 (DB)**: Tabel `trx_ticket_issue`.
- [ ] **Phase 2 (Rust)**: Ticket Lifecycle Engine (Create, Assign, Pending, Resolve).
- [ ] **Phase 3 (Next.js)**: Kanban Board Ticket & Customer Portal Request.
- [ ] **Phase 4 (QA/Sec)**: Test flow transisi status tiket (`test_flows/SD01.py`).

### SD02: SLA Manager & Escalation Workflow
- [ ] **Phase 1 (DB)**: Kolom SLA & rekapitulasi `trx_summary_monthly`.
- [ ] **Phase 2 (Rust)**: Worker pemantau SLA countdown & auto-escalation assignee.
- [ ] **Phase 3 (Next.js)**: SLA Breach Warning Banner & Monthly Executive SLA Report.
- [ ] **Phase 4 (QA/Sec)**: Test pemicu eskalasi tiket SLA breached (`test_flows/SD02.py`).

---

## 8. Group AG: AI Gateway & Automation Integration

### AG01: MCP Gateway Registry & Tool Routing
- [ ] **Phase 1 (DB)**: Registri endpoint MCP Server & Tool Specs di `dat_mcp_tool`.
- [ ] **Phase 2 (Rust)**: Model Context Protocol (MCP) Router & JSON-RPC Gateway.
- [ ] **Phase 3 (Next.js)**: MCP Tools Catalog & Execution Playground.
- [ ] **Phase 4 (QA/Sec)**: Test eksekusi aman tool MCP (`test_guard/AG01.py`).
