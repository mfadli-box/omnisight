# Daily Progress Tracker: Unified Enterprise IT, Network, Container & SecOps Platform

- **Target Ekosistem**: `osc_base` (PostgreSQL + Prisma), `osc_rest` (Rust Clean Arch + RustFS + Excel), `osc_site` (Next.js + shadcn/ui + BFF Proxy), `osc_auto` (5 Cross-Platform Go Agents), `osc_docs/test` (Python Pytest QA & SOC)
- **Master Blueprint**: `osc_docs/reengineering.md`
- **Pola Kerja**: 1 Hari = 1 Micro-Prompt (`tahapan-eksekusi-v2-sesi-1.2-to-5.1.txt`) + Wajib `/new` sebelum mulai sesi baru.

---

## Definition of Done (DoD) Harian
Setiap sesi harian baru boleh dicentang `[x]` apabila seluruh poin berikut terpenuhi:
1. [ ] Memulai sesi bersih (`/new`) dengan variant model yang disarankan (`medium` / `high` / `max`).
2. [ ] Kode/konfigurasi ditulis sesuai batas layer **Clean Architecture** tanpa `.unwrap()` (Rust) atau `any` (TypeScript).
3. [ ] Dokumentasi teknis Markdown di `osc_docs/<domain>/` dibuat atau diperbarui.
4. [ ] Perintah verifikasi lokal (`docker compose config`, `prisma validate`, `cargo check`, `tsc --noEmit`, `go test`, atau `pytest`) lolos tanpa error.
5. [ ] Melakukan `git add . && git commit -m "chore(sesi-X.Y): <deskripsi>"` sebagai checkpoint harian.

---

## Jadwal Eksekusi 21 Hari (Minggu 1 - Minggu 3)

### Minggu 1: Audit 12 Repositori & Fondasi Database
- [x] **Hari 1 (`SESI 0.1`)** | `ai-main` | Variant: `medium` | Audit Grup A (Directus, Snipe-IT, GLPI) -> `osc_docs/audit-group-a.md`
- [x] **Hari 2 (`SESI 0.2`)** | `ai-main` | Variant: `medium` | Audit Grup B (NetBox, LibreNMS, Uptime Kuma, Nginx UI) -> `osc_docs/audit-group-b.md`
- [x] **Hari 3 (`SESI 0.3`)** | `ai-main` | Variant: `medium` | Audit Grup C & D (Dockge, Arcane, Beszel, Wazuh, JumpServer) -> `osc_docs/audit-group-c.md`
- [x] **Hari 4 (`SESI 0.4`)** | `ai-main` | Variant: `high` | Penyusunan Master Blueprint (`osc_docs/reengineering.md`) + Pembersihan `.rea_docs/`
- [x] **Hari 5 (`SESI 1.1`)** | `ai-main` | Variant: `medium` | Setup Fondasi Docker (`postgres`, `rustfs`, `rustfs-init`, `.env.example`) -> `osc_docs/infrastructure.md`
- [x] **Hari 6 (`SESI 1.2`)** | `ai-base` | Variant: `high` | Skema Prisma Bagian 1: Multi-Company, HRIS Cache, TOTP MFA, Menu Privilege, Directus RBAC, Notification & Agent Enrollment -> `osc_docs/base/schema-p1.md`
- [x] **Hari 7 (`SESI 1.3`)** | `ai-base` | Variant: `high` | Skema Prisma Bagian 2: ITAM (Snipe-IT/GLPI) & DCIM/IPAM (NetBox/LibreNMS) terikat `company_id` -> `osc_docs/base/schema-p2.md`

### Minggu 2: Finalisasi Skema, Wave 1 Full-Stack & Wave 2 Control Plane
- [ ] **Hari 8 (`SESI 1.4`)** | `ai-base` | Variant: `high` | Skema Prisma Bagian 3 (Telemetry, Uptime, Docker, Nginx, SecOps, PAM) + Migrasi SQL + Idempotent Seeder (`prisma/seed.ts`) -> `osc_docs/base/schema-p3.md`
- [ ] **Hari 9 (`SESI 2.1`)** | `ai-rest` | Variant: `max` | Wave 1 Backend Rust: Dual-Mode Login (HRIS ASMX XML + Circuit Breaker + Argon2id Cache), TOTP MFA + Reset, Company Switcher, Menu Navigation, Dynamic Query AST, ITAM/DCIM/IPAM & Bulk Excel -> `osc_docs/rest/api-w1.md` + `osc_docs/rest/contracts/`
- [ ] **Hari 10 (`SESI 2.2`)** | `ai-site` | Variant: `medium` | Wave 1 Frontend Next.js: Secure BFF Proxy, Login Company Selector + `InputOTP` MFA/Reset, Company Switcher, Dynamic Sidebar Menu, Studio Explorer, ITAM/DCIM/IPAM & Excel UI -> `osc_docs/site/app-w1.md`
- [ ] **Hari 11 (`SESI 2.3`)** | `ai-test` | Variant: `medium` | Wave 1 QA & SOC Test: Uji HRIS XML & Offline Cache, TOTP Anti-Replay & Reset, Company Switcher IDOR, Menu Privilege, Query AST SQLi & Excel Formula Injection -> `osc_docs/test/rest_qad/` & `osc_docs/test/rest_soc/`
- [ ] **Hari 12 (`SESI 3.1`)** | `ai-rest` | Variant: `max` | Wave 2 Backend Rust: Agent Enrollment (`POST /agents/enroll`), Telemetry/Inventory/SNMP Ingest, Uptime Monitors, Docker Compose & Nginx Config Control Plane + SSE Logs -> `osc_docs/rest/api-w2.md`
- [ ] **Hari 13 (`SESI 3.2`)** | `ai-auto` | Variant: `high` | Wave 2 Tiga Agent Golang (`--enroll` + Linux `systemd` & Windows Service): `host_telemetry_agent`, `network_poller_agent`, `infra_control_agent` -> `osc_docs/auto/<agent>/README.md`
- [ ] **Hari 14 (`SESI 3.3`)** | `ai-site` | Variant: `medium` | Wave 2 Frontend Next.js: NOC & Telemetry Dashboard, Uptime Status Page, Docker `compose.yaml` & Nginx Config Editor + Agent Enrollment UI -> `osc_docs/site/app-w2.md`

### Minggu 3: Wave 2 Test, Wave 3 SecOps/PAM & Finalisasi Produksi
- [ ] **Hari 15 (`SESI 3.4`)** | `ai-test` | Variant: `medium` | Wave 2 QA & SOC Test: Uji Agent Enrollment Replay, Path Traversal & Command Injection pada Docker/Nginx Control Agent -> `osc_docs/test/rest_qad/` & `osc_docs/test/rest_soc/`
- [ ] **Hari 16 (`SESI 4.1`)** | `ai-rest` | Variant: `max` | Wave 3 Backend Rust: SIEM/FIM/CVE Ingest, PAM Session Authorization (**Mandatory MFA + Step-Up 15 Menit**), Ephemeral WS Ticket & Immutable Session Recording di RustFS -> `osc_docs/rest/api-w3.md`
- [ ] **Hari 17 (`SESI 4.2`)** | `ai-auto` | Variant: `high` | Wave 3 Dua Agent Golang: `pam_bastion_gateway` (SSH/WebSocket Proxy + Command ACL + Recording) & `flow_worker_agent` (SMTP/Telegram/Webhook Notification Dispatcher + Retention Cleanup) -> `osc_docs/auto/<agent>/README.md`
- [ ] **Hari 18 (`SESI 4.3`)** | `ai-site` | Variant: `medium` | Wave 3 Frontend Next.js: SOC Security/FIM/CVE Dashboard, Step-Up OTP Modal, Web SSH Terminal (`xterm.js`), Session Replay & Notification Channel Settings -> `osc_docs/site/app-w3.md`
- [ ] **Hari 19 (`SESI 4.4`)** | `ai-test` | Variant: `max` | Wave 3 SOC Penetration Test: Bypass Mandatory MFA & Step-Up 15 Menit pada PAM, Command Filter Evasion & Vault Isolation -> `osc_docs/test/rest_soc/`
- [ ] **Hari 20 (`SESI 5.1`)** | `ai-main` | Variant: `medium` | Finalisasi Multi-Stage `Dockerfile` (non-root), `docker-compose.yml` Full-Stack (`prisma-migrate` + `db seed`, `osc_rest`, `osc_site`, `osc_auto` agents) & Cleanup `.rea_temp/` -> `osc_docs/production.md`
- [ ] **Hari 21 (`SMOKE TEST`)** | `ai-main` | Variant: `medium` | Uji End-to-End Full-Stack (`docker compose up -d`): Login Super Admin, Setup Company + HRIS, Aktivasi MFA, Switch Company, Import Excel Aset, & Sesi PAM Terminal

---

## Log Catatan & Kendala Harian

| Tanggal | Sesi | Status | Ringkasan Hasil & Catatan Verifikasi |
| :--- | :--- | :--- | :--- |
| 2026-11-12 | `SESI 0.1` | Selesai | Audit statis Grup A (Directus, Snipe-IT, GLPI) tersimpan di `osc_docs/audit-group-a.md`. |
| 2026-11-12 | `SESI 0.2` | Selesai | Audit statis Grup B (NetBox, LibreNMS, Uptime Kuma, Nginx UI) tersimpan di `osc_docs/audit-group-b.md`. |
| 2026-11-12 | `SESI 0.3` | Selesai | Audit statis Grup C & D (Dockge, Arcane, Beszel, Wazuh, JumpServer) tersimpan di `osc_docs/audit-group-c.md`. |
| 2026-11-12 | `SESI 0.4` | Selesai | Master Blueprint `osc_docs/reengineering.md` selesai disusun & `.rea_docs/` dibersihkan. |
| 2026-11-12 | `SESI 1.1` | Selesai | Fondasi Docker (`postgres`, `rustfs`, `rustfs-init`) & `.env.example` tervalidasi via `docker compose config`. |
| 2026-11-12 | `SESI 1.2` | Selesai | Skema Prisma P1 di `osc_base/prisma/schema.prisma`: 17 model (`Company` + HRIS URL/TTL, `User` + MFA/HRIS sync, `Role`/`Policy`/`RolePolicy`/`Permission` CRUD+field-level+row filter JSON, `Session`, `UserCompanyAccess`, `MenuModule` + `CompanyMenuPrivilege`, Studio 3 tabel metadata, `ActivityLog` multi-tenant, `WebhookFlow`, `NotificationChannel`, `AgentEnrollmentToken`). Enum bootstrap `user_role` diganti model `Role` dinamis; `audit_logs` diganti `activity_logs` (tenant isolation). Verifikasi: `npx prisma format` OK + `npx prisma validate` OK (Prisma 6.19.3, exit 0). ERD & spesifikasi: `osc_docs/base/schema-p1.md`. |
| 2026-11-12 | `SESI 1.3` | Selesai | Skema Prisma P2 di `osc_base/prisma/schema.prisma`: +24 model terikat FK `company_id` (Restrict, terindeks). ITAM/Service Desk (14): `Department`, `Location`, `Category` (+type TICKET), `Manufacturer`, `Supplier`, `StatusLabel` (state machine DEPLOYABLE/PENDING/ARCHIVED), `AssetModel`, `Asset` (entitas induk server/network device/workstation: node_type, asset_tag unique per company, mgmt_ip INET, site+location_path, inventaris agent-driven), `AssetCheckoutLog`, `SoftwareLicense`, `LicenseSeat`, `HardwareInventorySnapshot`, `Ticket` (state int GLPI) + `TicketFollowup`. DCIM/IPAM (10): `Site`, `Rack`, `RackUnitAllocation`, `DeviceInterface`, `CableConnection`, `Vlan`, `IpPrefix` (cidr VarChar, GIST via migration SQL), `IpAddress` (INET), `SnmpDeviceProfile` (kredensial Envelope AES-256-GCM), `InterfaceMetricSnapshot` (time-series, index composite `(interface_id, collected_at DESC)`). +14 enum; datasource `url=env("DATABASE_URL")` dipulihkan (komentar stale `prisma.config.ts` menyebabkan P1012). Verifikasi: `npx prisma format` OK + `npx prisma validate` OK (Prisma 6.19.3, exit 0). ERD & relasi lintas modul: `osc_docs/base/schema-p2.md`. |
