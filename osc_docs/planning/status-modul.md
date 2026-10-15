# Status & Panduan Pembangunan Modul

> Panduan **lengkap** untuk membangun stack per aplikasi: backend → alat
> (frontend dan/atau agen) → dokumentasi → testing → **update Docker image**.
> Melengkapi [susunan-modul.md](susunan-modul.md) (urutan per alur data) dan
> [checklist.md](checklist.md). 🔗 [planning/README.md](README.md).

## 1. Definisi & Konvensi

| Istilah | Arti |
|---|---|
| **Kode modul** | Kode aplikasi/fitur `PREFIXnn` (mengikuti halaman frontend di dokumen modul). |
| **Alat** | `frontend` = halaman `osc_site`; `agent` = biner `osc_auto`; `keduanya` = halaman + agen. |
| **Status backend** | `done` = handler/skeleton `osc_rest` ada & terdaftar di `backbone/routes.go`. |
| **Status alat** | `done` = halaman/agen **operasional** (scaffold agen & kerangka halaman = `pending`). |

**Lokasi artefak (konvensi repo):**

| Lapisan | Lokasi |
|---|---|
| Skema DB | `osc_base/prisma/schema/cluster_<modul>.prisma` (sudah selesai) |
| Backend | `osc_rest/skeleton/<modul>/` → `*_handler.go`, `*_usecase.go`, `*_repository.go`, `*_template.go` |
| Route | `osc_rest/backbone/routes.go` (grup `admin`; `USAuth()`, `USLock()`, mutasi `USRole("<MOD>", level)`) |
| Frontend | `osc_site/src/app/board/pages/<PREFIX>/<KODE>/` → `page.tsx`, `api.ts`, `schemas.ts`, `components/` |
| Agen | `osc_auto/agent_<role>/main.go` + `osc_auto/internal/agent/` (capability per modul) |
| Docs | `osc_docs/database/cluster_<modul>.md`, `osc_docs/planning/app_<modul>.md`, `osc_docs/{backend,frontend}/README.md` |
| Test | `osc_docs/testing/test_backend_api.py` (kontrak API), `osc_docs/testing/test_frontend_logic.py` (logika TS) |
| Docker | `docker-compose.yml` (host), `osc_auto/docker-compose.agent.yml` (agen) |

**RBAC:** baca `VIEW`, tulis `POST`; modul ber-`USRole("<MOD>", level)`.
**Audit:** setiap mutasi UI → `USLogs` (`app_user_action`).

## 2. Alur Pembangunan Standar (per aplikasi)

Setiap aplikasi dibangun dengan urutan tetap. Ganti `<MOD>` = prefix modul,
`<NN>` = nomor aplikasi.

```text
0. DB          → skema cluster_<modul>.prisma sudah ada (migrasi baseline)
1. Backend     → osc_rest/skeleton/<modul>/ + daftarkan route + RBAC + audit
2. Alat        → sesuai kolom Alat:
   • frontend  → osc_site/src/app/board/pages/<PREFIX>/<KODE>/
   • agent     → osc_auto/agent_<role>/ (capability + endpoint /rest/agent/<modul>/*)
   • keduanya  → kerjakan frontend DAN agen
3. Dokumentasi → database/planning/backend/frontend/run
4. Testing     → test_backend_api.py + test_frontend_logic.py (+ E2E manual)
5. Docker      → build ulang image & restart service (pastikan image ter-update)
```

### Langkah 1 — Backend

1. Buat `osc_rest/skeleton/<modul>/<modul>_{handler,usecase,repository,template}.go`
   (lihat contoh `osc_rest/skeleton/app/app01/`).
2. Daftarkan route di `osc_rest/backbone/routes.go` pada grup `admin` dengan
   `USAuth(), USLock()`, mutasi `USRole("<MOD>", level)`.
3. Validasi input, filter `company_id` (isolasi tenant), tulis audit `USLogs`.

### Langkah 2 — Alat

**Frontend** (`Alat = frontend`/`keduanya`): buat
`osc_site/src/app/board/pages/<PREFIX>/<KODE>/` (`page.tsx`, `api.ts`,
`schemas.ts`, `components/`), akses backend lewat `/proxy/pages/*`, pakai
`@/uix/datatable` + `@/lib/grid`.

**Agen** (`Alat = agent`/`keduanya`): tambah capability di
`osc_auto/internal/agent/` dan endpoint `POST /rest/agent/<modul>/…` di
`osc_rest` (grup `USBots()`, token `bot_agent` + mTLS). Agen **tidak** mengakses DB.

### Langkah 3 — Dokumentasi

Perbarui: `osc_docs/database/cluster_<modul>.md` (bila ada perubahan),
`osc_docs/planning/app_<modul>.md`, `osc_docs/backend/README.md`,
`osc_docs/frontend/README.md`, `osc_docs/development/run.md`,
dan status di `planning/status-modul.md` + `planning/checklist.md`.

### Langkah 4 — Testing

- `python osc_docs/testing/test_backend_api.py` — kontrak endpoint (butuh server
  jalan; di-skip bila tidak reachable).
- `python osc_docs/testing/test_frontend_logic.py` — logika TS (`@/lib/grid`).
- Uji manual/E2E alur CRUD + RBAC per level.

### Langkah 5 — Update Docker Image

```bash
# Host (backend + frontend)
docker compose build --no-cache osc_rest osc_site
docker compose up -d osc_rest osc_site

# Agen (bila Alat memakai agen)
docker compose -f osc_auto/docker-compose.agent.yml build agent_vm
docker compose -f osc_auto/docker-compose.agent.yml up -d agent_vm
```

> Wajib rebuild setiap kali kode berubah agar image **ter-update**. Verifikasi:
> `docker compose ps` (healthy) + `docker compose logs -f osc_rest`.

## 3. Contoh Lengkap — Membangun `APP06` (Notification & Template)

Alat = **Frontend** (bukan agen). Urutannya:

1. **Backend** — `osc_rest/skeleton/app/app06/` (`app06_handler.go` dst.);
   daftarkan grup `admin` dengan `USRole("APP06", level)` di `routes.go`.
   Area: Channels, Templates, Rules, Message Log.
2. **Alat = Frontend** —
   `osc_site/src/app/board/pages/APP/APP06/page.tsx` (+ `api.ts`, `schemas.ts`,
   `components/`): tab Channels/Templates/Rules/Message Log; kirim test & retry.
3. **Dokumentasi** — update `planning/app_sys.md`, `backend/README.md`,
   `frontend/README.md`, `checklist.md` (`APP06 → [x]`).
4. **Testing** — tambah kasus di `test_backend_api.py` (kontrak
   `/rest/pages/APP/APP06/*`) + uji kirim notifikasi.
5. **Docker** — `docker compose build --no-cache osc_rest osc_site && docker compose up -d osc_rest osc_site`.

> Andaikan `APP06` ber-alat **agent**: tambah capability di `osc_auto` +
> endpoint `/rest/agent/app06/*`, lalu rebuild `agent_vm`. Bila **keduanya**:
> kerjakan langkah frontend **dan** agen.

## 4. Definition of Done (per aplikasi)

- [ ] **DB** — model & migrasi ada (baseline).
- [ ] **Backend** — skeleton + route terdaftar + validasi + RBAC + audit.
- [ ] **Alat** — frontend (`page.tsx`+`api.ts`+`schemas.ts`) dan/atau agen (capability + endpoint `/rest/agent`).
- [ ] **Docs** — database/planning/backend/frontend + checklist diperbarui.
- [ ] **Test** — `test_backend_api.py` & `test_frontend_logic.py` hijau.
- [ ] **Docker** — image ter-build ulang & service healthy.

## 5. Kartu Modul (per modul)

Format tiap kartu: **Alat · Backend · Frontend · Agen · Models · Docs · Test · Docker**,
lalu tabel aplikasi (`Kode | Nama | Backend | Frontend`).

---

### `PUB00` — Login / Auth (Frontend · **done**)
- **Backend**: `osc_rest/skeleton/pub/` (`pub.PUB00Company`, `PUB00Login`).
- **Frontend**: `osc_site/src/app/login/`.
- **Agen**: —
- **Docs**: `planning/modules/pub00.md`.
- **Test/Docker**: standar (rebuild `osc_rest`/`osc_site`).

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `PUB00` | Login / Auth | `POST /rest/guest/PUB00` | `/login` |

### `APP00`–`APP05` + `SYS01`–`SYS03` — Core & Identitas (Frontend · **done**)
- **Backend**: `osc_rest/skeleton/app/app00`…`app05`, `applink`, `skeleton/sys`.
- **Frontend**: `osc_site/src/app/board/pages/APP/APP0x`, `.../SYS/SYS0x`, shell `board/`.
- **Docs**: `planning/modules/*.md`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `APP00` | Navigation shell | `APP00` logout/company/module | `board/` |
| `APP01` | Module (admin) | `/rest/pages/APP/APP01/*` | `APP/APP01/` |
| `APP02` | Company (admin) | `APP02` | `APP/APP02/` |
| `APP03` | User (admin) | `APP03` | `APP/APP03/` |
| `APP04` | Signature (admin) | `APP04` | `APP/APP04/` |
| `APP05` | Session/Token/Action | `APP05` | `APP/APP05/` |
| `SYS01` | Profil user | `GET /rest/pages/SYS01/profile` | `SYS/SYS01/` |
| `SYS02` | Ganti password | `SYS02` | `SYS/SYS02/` |
| `SYS03` | Riwayat sesi/login | `GET /rest/pages/SYS03/history` | `SYS/SYS03/` |

### `APP06`–`APP11` — Admin Lanjutan (Frontend)
- **Backend**: `osc_rest/skeleton/app/app06`…`app11` (rujuk `app_sys.md` §6.1).
- **Frontend**: `osc_site/src/app/board/pages/APP/APP06`…`APP11`.
- **Docs**: `planning/app_sys.md`; **Test/Docker**: standar.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `APP06` | Notification & Template | Channels/Templates/Rules/Message Log | `APP/APP06/` |
| `APP07` | Integration Hub HRIS/SSO | Integrations/SSO/HRIS/Employees | `APP/APP07/` |
| `APP08` | API Key & Webhook | Keys/Webhooks/Deliveries | `APP/APP08/` |
| `APP09` | Audit & Report | Audit log/Reports | `APP/APP09/` |
| `APP10` | Preference & Branding | Preferences/Company settings | `APP/APP10/` |
| `APP11` | Backup & Restore | Backups/restore/dry-run | `APP/APP11/` |

### `AMM` — Asset Management & CMDB (Frontend)
- **Backend**: `osc_rest/skeleton/amm/` (+ `amm_export.go`); endpoint `app_amm.md` §6.1.
- **Frontend**: `osc_site/src/app/board/pages/AMM/AMMxx/`.
- **Agen**: —
- **Models**: `amm_*`. **Docs**: `database/cluster_amm.md`, `planning/app_amm.md`.
- **Test**: kontrak `/rest/pages/AMM/*` + export Excel.
- **Docker**: rebuild `osc_rest` & `osc_site`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `AMM01` | Dashboard | `GET /rest/pages/AMM/overview` | `AMM/AMM01/` |
| `AMM02` | Assets | `GET/POST /AMM/assets` | `AMM/AMM02/` |
| `AMM03` | Asset detail | `/AMM/assets/:id` (+nested) | `AMM/AMM03/` |
| `AMM04` | Types/Tags/Models/Departments/Status | `/AMM/types`,`/asset-models`,`/manufacturers`,`/departments`,`/status-labels` | `AMM/AMM04/` |
| `AMM05` | Licenses | `/AMM/licenses` | `AMM/AMM05/` |
| `AMM06` | Maintenance | `/AMM/maintenance` | `AMM/AMM06/` |
| `AMM07` | CMDB / Relations | `/AMM/assets/:id/relations` | `AMM/AMM07/` |
| `AMM08` | Labels (QR/barcode) | `/AMM/assets/labels`,`/assets/:id/qr` | `AMM/AMM08/` |
| `AMM09` | Export/Import | `/AMM/assets/export`,`/import` | `AMM/AMM09/` |
| `AMM10` | Custom fields & Fieldsets | `/AMM/custom-fields`,`/fieldsets` | `AMM/AMM10/` |
| `AMM11` | Suppliers & Contracts | `/AMM/suppliers`,`/contracts` | `AMM/AMM11/` |
| `AMM12` | Consumables & Accessories | `/AMM/consumables`,`/accessories` | `AMM/AMM12/` |
| `AMM13` | Requests | `/AMM/requests` | `AMM/AMM13/` |
| `AMM14` | Reports | `/AMM/reports` | `AMM/AMM14/` |
| `AMM15` | Kits/Components/Reservations | `/AMM/kits`,`/components`,`/reservations` | `AMM/AMM15/` |
| `AMM16` | Audits (Annual Inventory) | `/AMM/audits` | `AMM/AMM16/` |
| `AMM17` | API Tokens & Logs | `/AMM/api-tokens`,`/api-logs` | `AMM/AMM17/` |

### `NET` — Network & MikroTik (Keduanya · agen `agent_vm`)
- **Backend**: `osc_rest/skeleton/net/`; endpoint `app_net.md` §6.1.
- **Frontend**: `osc_site/src/app/board/pages/NET/NETxx/`.
- **Agen**: `osc_auto/agent_vm` (RouterOS API/REST + SNMP + trap/syslog + discovery);
  endpoint agen `app_net.md` §6.2.1. Safe apply: dry-run + rollback (`net_config_backup`).
- **Models**: `net_*`. **Docs**: `database/cluster_net.md`, `planning/app_net.md`.
- **Test**: kontrak `/NET/*` + uji ping/sync.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_vm`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `NET01` | Overview/Topologi | `GET /rest/pages/NET/*` | `NET/NET01/` |
| `NET02` | Devices | `/NET/devices` (+ping/test) | `NET/NET02/` |
| `NET03` | Device detail (SNMP/optik/sensor) | `/NET/devices/:id/{resource,interfaces,sensors,snmp}` | `NET/NET03/` |
| `NET04` | Firewall | `/NET/devices/:id/firewall/:table` | `NET/NET04/` |
| `NET05` | Address-lists | `/NET/devices/:id/address-lists` | `NET/NET05/` |
| `NET06` | Backups & diff | `/NET/devices/:id/backups`,`/config/search` | `NET/NET06/` |
| `NET07` | Logs & counters (syslog) | `/NET/logs`,`/NET/devices/:id/events` | `NET/NET07/` |
| `NET08` | Change history | `/NET/changes` | `NET/NET08/` |
| `NET09` | Hardening | `/NET/devices/:id/{users,services,logging}` | `NET/NET09/` |
| `NET10` | Topology (L2) | `/NET/topology` | `NET/NET10/` |
| `NET11` | Discovery | `/NET/discovery/scan`,`/NET/discovery` | `NET/NET11/` |
| `NET12` | Alert rules & events | `/NET/alert-rules`,`/NET/alerts` | `NET/NET12/` |
| `NET13` | Groups | `/NET/groups` | `NET/NET13/` |
| `NET14` | Billing / 95th percentile | `/NET/billing`,`/billing-rules` | `NET/NET14/` |
| `NET15` | Availability / SLA | `/NET/sla`,`/devices/:id/availability` | `NET/NET15/` |
| `NET16` | VLAN & IP addresses | `/NET/devices/:id/{vlans,ip-addresses}` | `NET/NET16/` |
| `NET17` | Hardware inventory | `/NET/devices/:id/inventory` | `NET/NET17/` |
| `NET18` | API tokens | `/NET/api-tokens` | `NET/NET18/` |
| `NET19` | Maintenance windows | `/NET/maintenance` | `NET/NET19/` |

### `VMS` — VM & Hypervisor (Keduanya · agen `agent_vm`)
- **Backend**: `osc_rest/skeleton/vms/`; endpoint `app_vms.md` §6.1.
- **Frontend**: `osc_site/src/app/board/pages/VMS/VMSxx/`.
- **Agen**: `osc_auto/agent_vm` driver hypervisor (Incus/LXD dulu); console noVNC (§6.2/§6.3).
- **Models**: `vms_*`. **Docs**: `database/cluster_vms.md`, `planning/app_vms.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_vm`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `VMS01` | Dashboard | `GET /rest/pages/VMS/*` | `VMS/VMS01/` |
| `VMS02` | Hosts | `/VMS/hosts` | `VMS/VMS02/` |
| `VMS03` | Host detail | `/VMS/hosts/:id/metrics` | `VMS/VMS03/` |
| `VMS04` | Guests | `/VMS/guests`,`/guests/bulk` | `VMS/VMS04/` |
| `VMS05` | Guest detail (+noVNC) | `/VMS/guests/:id/console` | `VMS/VMS05/` |
| `VMS06` | Snapshots | `/VMS/guests/:id/snapshots` | `VMS/VMS06/` |
| `VMS07` | Templates | `/VMS/templates` | `VMS/VMS07/` |
| `VMS08` | Findings | `/VMS/findings` | `VMS/VMS08/` |
| `VMS09` | Tasks/Activity | `/VMS/tasks` | `VMS/VMS09/` |
| `VMS10` | Create VM | `POST /VMS/guests` | `VMS/VMS10/` |
| `VMS11` | Storage & ISO | `/VMS/hosts/:id/{storages,isos}` | `VMS/VMS11/` |
| `VMS12` | Backups | `/VMS/guests/:id/backups` | `VMS/VMS12/` |
| `VMS13` | Firewall & security groups | `/VMS/guests/:id/firewall`,`/security-groups` | `VMS/VMS13/` |
| `VMS14` | Cluster & HA | `/VMS/clusters`,`/guests/:id/ha`,`/replications` | `VMS/VMS14/` |
| `VMS15` | SDN & resource pool | `/VMS/sdn/zones`,`/vnets`,`/pools` | `VMS/VMS15/` |

### `SEC` — Security Operations / SIEM (Keduanya · agen `agent_vm`)
- **Backend**: `osc_rest/skeleton/sec/`; endpoint `app_sec.md` §7.1.
- **Frontend**: `osc_site/src/app/board/pages/SEC/SECxx/`.
- **Agen**: `osc_auto/agent_vm` capability security; endpoint `app_sec.md` §7.2
  (`/rest/agent/sec/*`). Rule engine & korelasi §7.3.
- **Models**: `sec_*`. **Docs**: `database/cluster_sec.md`, `planning/app_sec.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_vm`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `SEC01` | Dashboard | `GET /rest/pages/SEC/overview` | `SEC/SEC01/` |
| `SEC02` | Agents | `/SEC/agents` (+enroll/upgrade) | `SEC/SEC02/` |
| `SEC03` | Events & Alerts | `/SEC/events`,`/SEC/alerts` | `SEC/SEC03/` |
| `SEC04` | Rules & Decoders | `/SEC/rules`,`/decoders`,`/logtest` | `SEC/SEC04/` |
| `SEC05` | File Integrity (FIM) | `/SEC/fim` | `SEC/SEC05/` |
| `SEC06` | SCA | `/SEC/sca/policies`,`/sca/results` | `SEC/SEC06/` |
| `SEC07` | Vulnerabilities | `/SEC/vulns`,`/vuln-feeds` | `SEC/SEC07/` |
| `SEC08` | Incidents | `/SEC/incidents` | `SEC/SEC08/` |
| `SEC09` | Active Response | `/SEC/responses`,`/response-scripts` | `SEC/SEC09/` |
| `SEC10` | Compliance | `/SEC/compliance/reports` | `SEC/SEC10/` |
| `SEC11` | Settings | `/SEC/settings`,`/log-sources`,`/agent-groups`,`/rbac` | `SEC/SEC11/` |
| `SEC12` | Feeds & Forwarding | `/SEC/rule-feeds`,`/intel-feeds`,`/forwarders` | `SEC/SEC12/` |
| `SEC13` | Inventory (Syscollector) | `/SEC/inventory` | `SEC/SEC13/` |
| `SEC14` | Live Query / IR | `/SEC/live-queries`,`/osquery` | `SEC/SEC14/` |
| `SEC15` | CDB Lists | `/SEC/cdb-lists` | `SEC/SEC15/` |
| `SEC16` | Cloud & Containers | `/SEC/cloud/accounts`,`/containers/events` | `SEC/SEC16/` |
| `SEC17` | Malware | `/SEC/malware` | `SEC/SEC17/` |
| `SEC18` | MITRE ATT&CK | `/SEC/mitre/coverage` | `SEC/SEC18/` |

### `PAM` — Bastion / Privileged Access (Keduanya · agen `agent_vm`)
- **Backend**: `osc_rest/skeleton/pam/`; endpoint `app_pam.md` §6.1.
- **Frontend**: `osc_site/src/app/board/pages/PAM/PAMxx/`.
- **Agen**: relay `agent_vm`; endpoint `app_pam.md` §6.3.
- **Models**: `pam_*`. **Docs**: `database/cluster_pam.md`, `planning/app_pam.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_vm`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `PAM01` | Dashboard | `GET /rest/pages/PAM/overview` | `PAM/PAM01/` |
| `PAM02` | Assets | `/PAM/assets` | `PAM/PAM02/` |
| `PAM03` | Accounts (vault) | `/PAM/accounts`,`/account-templates` | `PAM/PAM03/` |
| `PAM04` | Policies & Grants | `/PAM/policies`,`/grants` | `PAM/PAM04/` |
| `PAM05` | Live Sessions | `/PAM/sessions/live`,`/sessions/:id/shadow` | `PAM/PAM05/` |
| `PAM06` | Sessions (replay) | `/PAM/sessions/:id/replay` | `PAM/PAM06/` |
| `PAM07` | Command Filters | `/PAM/filters`,`/filter-bindings` | `PAM/PAM07/` |
| `PAM08` | Requests | `/PAM/requests`,`/approval-flows`,`/ticket-providers` | `PAM/PAM08/` |
| `PAM09` | Settings | `/PAM/settings`,`/apikeys` | `PAM/PAM09/` |
| `PAM10` | Gateway & Security | `/PAM/gateways`,`/login-acls` | `PAM/PAM10/` |
| `PAM11` | Health & Ops | `/PAM/health` | `PAM/PAM11/` |

### `WAF` — Web Application Firewall (Keduanya · agen `agent_ws`)
- **Backend**: `osc_rest/skeleton/waf/`; model `sec_waf_rule`,`sec_waf_event`.
- **Frontend**: `osc_site/src/app/board/pages/WAF/WAFxx/`.
- **Agen**: `osc_auto/agent_ws` (ingest event WAF).
- **Docs**: `database/cluster_sec.md` (bagian WAF).
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_ws`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `WAF01` | Overview | `GET /rest/pages/WAF/overview` | `WAF/WAF01/` |
| `WAF02` | Rules | `/WAF/rules` (`sec_waf_rule`) | `WAF/WAF02/` |
| `WAF03` | Events | `/WAF/events` (`sec_waf_event`) | `WAF/WAF03/` |

### `WEB` — Web Server/Proxy + Domain & DNS (Keduanya · agen `agent_ws`)
- **Backend**: `osc_rest/skeleton/web/`; endpoint `app_web.md` §6.1.
- **Frontend**: `osc_site/src/app/board/pages/WEB/WEBxx/`.
- **Agen**: `osc_auto/agent_ws` (nginx apply/reload, ACME); endpoint §6.2. Safe apply §6.3.
- **Models**: `web_*`. **Docs**: `database/cluster_web.md`, `planning/app_web.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_ws`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `WEB01` | Dashboard | `GET /rest/pages/WEB/overview` | `WEB/WEB01/` |
| `WEB02` | Servers | `/WEB/servers`,`/:id/stats` | `WEB/WEB02/` |
| `WEB03` | Sites | `/WEB/vhosts`,`/vhosts/wizard` | `WEB/WEB03/` |
| `WEB04` | Site detail | `/WEB/vhosts/:id/{locations,tuning,apply}` | `WEB/WEB04/` |
| `WEB05` | Upstreams | `/WEB/upstreams` | `WEB/WEB05/` |
| `WEB06` | Streams | `/WEB/streams` | `WEB/WEB06/` |
| `WEB07` | Certificates (ACME) | `/WEB/certificates`,`/acme-accounts` | `WEB/WEB07/` |
| `WEB08` | Access Lists | `/WEB/access-lists` | `WEB/WEB08/` |
| `WEB09` | Domains & DNS | `/WEB/domains`,`/dns-providers`,`/dns-records` | `WEB/WEB09/` |
| `WEB10` | Changes & Revisions | `/WEB/changes`,`/deploys`,`/revisions` | `WEB/WEB10/` |
| `WEB11` | Settings | `/WEB/settings` | `WEB/WEB11/` |
| `WEB12` | Analytics | `/WEB/servers/:id/{access-stats,access-logs,logs/tail}` | `WEB/WEB12/` |
| `WEB13` | Snippets & Templates | `/WEB/snippets`,`/templates` | `WEB/WEB13/` |
| `WEB14` | Backup & Portabilitas | `/WEB/servers/:id/{backups,export,import}` | `WEB/WEB14/` |
| `WEB15` | Cluster Deploy | `/WEB/vhosts/:id/deploy`,`/servers/:id/mirror` | `WEB/WEB15/` |

### `POD` — Container/Pod (Keduanya · agen `agent_vm`)
- **Backend**: `osc_rest/skeleton/pod/`; endpoint `app_pod.md` §7.1. Compose §7.2.
- **Frontend**: `osc_site/src/app/board/pages/POD/PODxx/`.
- **Agen**: `osc_auto/agent_vm` (engine Docker/Podman/Compose); §7.3.
- **Models**: `pod_*`. **Docs**: `database/cluster_pod.md`, `planning/app_pod.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_vm`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `POD01` | Projects/Stacks | `/POD/stacks` (+actions) | `POD/POD01/` |
| `POD02` | Containers | `/POD/containers` (+exec/logs) | `POD/POD02/` |
| `POD03` | Images | `/POD/images` (pull/push/prune) | `POD/POD03/` |
| `POD04` | Volumes & Networks | `/POD/volumes`,`/networks` | `POD/POD04/` |
| `POD05` | Environments/Engines | `/POD/engines` | `POD/POD05/` |
| `POD06` | Registries | `/POD/registries`,`/git-credentials` | `POD/POD06/` |
| `POD07` | Scans | `/POD/scans`,`/images/:id/scan` | `POD/POD07/` |
| `POD08` | Templates | `/POD/templates`,`/template-registries` | `POD/POD08/` |
| `POD09` | Activity | `/POD/actions`,`/POD/events` | `POD/POD09/` |
| `POD10` | Kubernetes | `pod_cluster/node/workload` | `POD/POD10/` |
| `POD11` | System | `/POD/engines/:id/df`,`/system-backups`,`/pods` | `POD/POD11/` |
| `POD12` | Webhooks | `/POD/webhooks`,`POST /hooks/POD/:code` | `POD/POD12/` |
| `POD13` | Updates & Patching | `/POD/updates`,`/update-checks`,`/heal-policies`,`/patches` | `POD/POD13/` |
| `POD14` | Insights | `/POD/engines/:id/df` + metrics | `POD/POD14/` |
| `POD15` | Notifications | `/POD/notification-channels`,`/notification-templates` | `POD/POD15/` |
| `POD16` | API & Keys | `/POD/api-keys`,`/POD/openapi.json` | `POD/POD16/` |

### `OBS` — Observability (Keduanya · agen `agent_vm`)
- **Backend**: `osc_rest/skeleton/obs/`; endpoint `app_obs.md` §7.1. Evaluasi/notifikasi §7.3.
- **Frontend**: `osc_site/src/app/board/pages/OBS/OBSxx/`.
- **Agen**: `osc_auto/agent_vm`; endpoint `app_obs.md` §7.2 (`/rest/agent/obs/*`).
- **Models**: `obs_*`. **Docs**: `database/cluster_obs.md`, `planning/app_obs.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_vm`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `OBS01` | Dashboard | `GET /rest/pages/OBS/overview` | `OBS/OBS01/` |
| `OBS02` | Systems | `/OBS/systems` | `OBS/OBS02/` |
| `OBS03` | System detail | `/OBS/systems/:id/{metrics,disks}` | `OBS/OBS03/` |
| `OBS04` | Containers | `/OBS/containers` | `OBS/OBS04/` |
| `OBS05` | Network monitors | `/OBS/checks`,`/check-groups` | `OBS/OBS05/` |
| `OBS06` | Alerts | `/OBS/alert-rules`,`/OBS/alerts` | `OBS/OBS06/` |
| `OBS07` | Notifications | `/OBS/notifications` | `OBS/OBS07/` |
| `OBS08` | Settings | `/OBS/settings`,`/import/uptime-kuma` | `OBS/OBS08/` |
| `OBS09` | VM host & guests | `/OBS/systems/:id/vmhost`,`/OBS/vms` | `OBS/OBS09/` |
| `OBS10` | Reports | `/OBS/reports`,`/dashboards` | `OBS/OBS10/` |
| `OBS11` | Status pages | `/OBS/status-pages`,`/rest/guest/status/:slug` | `OBS/OBS11/` |
| `OBS12` | Maintenance | `/OBS/maintenance` | `OBS/OBS12/` |
| `OBS13` | Services (systemd) | `/OBS/systems/:id/services` | `OBS/OBS13/` |

### `DSO` — DevOps / CI-CD (Keduanya · agen `agent_ci`)
- **Backend**: `osc_rest/skeleton/dso/`; model `dso_pipeline`,`dso_build`,`dso_deploy`.
- **Frontend**: `osc_site/src/app/board/pages/DSO/DSOxx/`.
- **Agen**: `osc_auto/agent_ci` (runner).
- **Docs**: `database/cluster_dso.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_ci`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `DSO01` | Pipelines | `/DSO/pipelines` | `DSO/DSO01/` |
| `DSO02` | Builds | `/DSO/builds` | `DSO/DSO02/` |
| `DSO03` | Deploys | `/DSO/deploys` | `DSO/DSO03/` |

### `JMS` — Job Management (Frontend)
- **Backend**: `osc_rest/skeleton/jms/`; model `jms_job`,`jms_schedule`,`jms_run`.
- **Frontend**: `osc_site/src/app/board/pages/JMS/JMSxx/`.
- **Agen**: — (scheduler in-process backend).
- **Docs**: `database/cluster_jms.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `JMS01` | Jobs | `/JMS/jobs` | `JMS/JMS01/` |
| `JMS02` | Schedules | `/JMS/schedules` | `JMS/JMS02/` |
| `JMS03` | Runs (riwayat) | `/JMS/runs` | `JMS/JMS03/` |

### `BOT` — Bot / Agent Gateway (Keduanya)
- **Backend**: `osc_rest/skeleton/bot/`; model `bot_agent`,`bot_heartbeat`,`bot_task`.
- **Frontend**: `osc_site/src/app/board/pages/BOT/BOTxx/`.
- **Agen**: semua agen (`agent_*`) — registrasi `bot_agent` + heartbeat.
- **Docs**: `database/cluster_bot.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, agen.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `BOT01` | Agents (registry/enroll) | `/BOT/agents` | `BOT/BOT01/` |
| `BOT02` | Heartbeats (status) | `/BOT/heartbeats` | `BOT/BOT02/` |
| `BOT03` | Tasks (dispatch) | `/BOT/tasks` | `BOT/BOT03/` |

### `DOC` — Document & File Manager (Frontend)
- **Backend**: `osc_rest/skeleton/doc/` + `backbone/upload.go`; model `doc_*`.
- **Frontend**: `osc_site/src/app/board/pages/DOC/DOCxx/`.
- **Docs**: `database/cluster_doc.md`, `planning/app_collab.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `DOC01` | Files & Folders | `/DOC/files`,`/DOC/folders` | `DOC/DOC01/` |
| `DOC02` | Preview/Editor | `/DOC/files/:id/preview` | `DOC/DOC02/` |
| `DOC03` | Versions | `/DOC/files/:id/versions` | `DOC/DOC03/` |
| `DOC04` | Shares (tautan/ACL) | `/DOC/shares` | `DOC/DOC04/` |
| `DOC05` | Quota & Storage (LOCAL/S3) | `/DOC/quota` | `DOC/DOC05/` |

### `TIM` — Tim & Kolaborasi (Chat + Mail) (Keduanya · agen `agent_mx`)
- **Backend**: `osc_rest/skeleton/tim/`; model `tim_*`. Chat via WebSocket.
- **Frontend**: `osc_site/src/app/board/pages/TIM/TIMxx/`.
- **Agen**: `osc_auto/agent_mx` (mail relay SMTP/IMAP).
- **Docs**: `database/cluster_tim.md`, `planning/app_collab.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`, `agent_mx`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `TIM01` | Chat — Kanal/DM | `/TIM/rooms` | `TIM/TIM01/` |
| `TIM02` | Chat — Thread & Pesan | `/TIM/rooms/:id/messages` (WS) | `TIM/TIM02/` |
| `TIM03` | Mail — Inbox/Sent/Compose | `/TIM/mail` | `TIM/TIM03/` |
| `TIM04` | Mail — Accounts (SMTP/IMAP) | `/TIM/accounts` | `TIM/TIM04/` |

### `ANN` — Announcement/News (Frontend)
- **Backend**: `osc_rest/skeleton/ann/`; model `app_announcement`,`app_announcement_read`.
- **Frontend**: `osc_site/src/app/board/pages/ANN/ANNxx/` + widget dashboard.
- **Docs**: `database/cluster_app.md`, `planning/app_collab.md`.
- **Docker**: rebuild `osc_rest`, `osc_site`.

| Kode | Nama | Backend | Frontend |
|---|---|---|---|
| `ANN01` | Announcements (daftar) | `/ANN/announcements` | `ANN/ANN01/` |
| `ANN02` | Editor & Penjadwalan | `POST /ANN/announcements` | `ANN/ANN02/` |
| `ANN03` | Target & Read-tracking | `/ANN/announcements/:id/read` | `ANN/ANN03/` |
| `ANN04` | Dashboard widget | `GET /rest/pages/ANN/overview` | `ANN/ANN04/` |

## 6. Ringkasan Status per Aplikasi

`done/done` = `PUB00`, `APP00`–`APP05`, `SYS01`–`SYS03`. Sisanya `pending/pending`.

| Modul | Prefix | Aplikasi | Alat | Status Backend | Status Alat |
|---|---|---|---|---|---|
| Auth | `PUB` | `PUB00` | Frontend | done | done |
| Core/Nav | `APP` | `APP00`–`APP05` | Frontend | done | done |
| Profil | `SYS` | `SYS01`–`SYS03` | Frontend | done | done |
| Admin lanjutan | `APP` | `APP06`–`APP11` | Frontend | pending | pending |
| Aset | `AMM` | 17 app | Frontend | pending | pending |
| Network | `NET` | 19 app | Keduanya | pending | pending |
| VM | `VMS` | 15 app | Keduanya | pending | pending |
| Security | `SEC` | 18 app | Keduanya | pending | pending |
| Bastion | `PAM` | 11 app | Keduanya | pending | pending |
| WAF | `WAF` | 3 app | Keduanya | pending | pending |
| Web | `WEB` | 15 app | Keduanya | pending | pending |
| Container | `POD` | 16 app | Keduanya | pending | pending |
| Observability | `OBS` | 13 app | Keduanya | pending | pending |
| CI/CD | `DSO` | 3 app | Keduanya | pending | pending |
| Job | `JMS` | 3 app | Frontend | pending | pending |
| Agent | `BOT` | 3 app | Keduanya | pending | pending |
| Berkas | `DOC` | 5 app | Frontend | pending | pending |
| Kolaborasi | `TIM` | 4 app | Keduanya | pending | pending |
| Pengumuman | `ANN` | 4 app | Frontend | pending | pending |

## 7. Pemetaan Agen & Service Docker

| Modul | Agen | Capability | Service Docker |
|---|---|---|---|
| `NET`, `OBS`, `VMS`, `SEC`, `PAM`, `POD` | `agent_vm` | pod, net, obs, vms, sec, pam, web | `agent_vm` |
| `DSO` | `agent_ci` | dso | `agent_ci` |
| `TIM` (mail) | `agent_mx` | mx | `agent_mx` (profil `mx`) |
| `WEB`, `WAF` | `agent_ws` | web, waf | `agent_ws` (profil `ws`) |

| Komponen | Image/Dockerfile | Service compose |
|---|---|---|
| Backend | `osc_rest/Dockerfile` | `osc_rest` |
| Frontend | `osc_site/Dockerfile` | `osc_site` |
| DB/migrasi | `osc_base/Dockerfile` | `osc_base`, `osc_migrate` (profil `setup`) |
| Agen | `osc_auto/Dockerfile.agent` (`--build-arg AGENT=`) | `agent_vm/ci/mx/ws` |

## 8. Catatan

- Status **backend `done`/alat `done`** hanya core & identitas.
- Seluruh agen masih **scaffold** (`/health`, `/info`) → modul ber-alat agen `pending`.
- Urutan pengerjaan tetap mengikuti alur data di [susunan-modul.md](susunan-modul.md)
  (Master → Transaksi → Log/Agent → Report).
- Retensi log/telemetri otomatis: `osc_rest/backbone/retention.go`
  (`RE_DAYS`/`RE_LOGS`/`RE_REPORT`); rotasi log container: `logging.options` compose.
