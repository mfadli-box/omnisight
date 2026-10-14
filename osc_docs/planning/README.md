# Planning — Perencanaan, Blueprint & Checklist

> Pusat perencanaan pembangunan aplikasi OmniSight: cetak biru arsitektur,
> peta jalan (roadmap) aplikasi yang **akan** dibuat, dan checklist status
> aplikasi yang **sudah** dibuat.

## 1. Isi Folder

| Dokumen | Isi |
|---|---|
| [blueprint.md](blueprint.md) | Cetak biru arsitektur: visi, stack, topologi, otorisasi, konvensi modul & cluster, pola implementasi. |
| [roadmap.md](roadmap.md) | Perencanaan bertahap: fase, milestone, dan detail aplikasi yang akan dibuat. |
| [checklist.md](checklist.md) | Checklist status per aplikasi (database, backend, frontend, dokumen, test) — sudah/belum. |
| [modules/](modules/README.md) | Planning **per modul** untuk modul yang sudah ada (`PUB00`, `APP00`–`APP05`, `SYS`). |
| [additional.md](additional.md) | Data aset lokasi (store) yang harus diinput + pemetaan ke model `AMM`. |
| [app_pod.md](app_pod.md) | Rencana modul `POD` — Container/Pod: runtime Docker/Podman (pengganti Dockge & Arcane, GitOps, scan, backup) + Kubernetes. |
| [app_obs.md](app_obs.md) | Rencana modul `OBS` — Observability: monitoring host, container, **VM host & guest (hypervisor, prioritas Incus/LXD)** ala Beszel (hub + agent, metrik historis, alert). |
| [app_net.md](app_net.md) | Rencana modul `NET` — Network & **MikroTik** (firewall: filter/NAT/mangle/raw, address-list, backup/diff, audit, hardening) **+ SNMP monitoring** (trafik/interface, trap/syslog, topologi L2 ala LibreNMS). Akses via agen `agent_vm`. |
| [app_vms.md](app_vms.md) | Rencana modul `VMS` — **manajemen VM** (power/snapshot/clone/console noVNC) + temuan keamanan host/VM (impor dari `SEC`). Hypervisor prioritas Incus/LXD. |
| [app_sec.md](app_sec.md) | Rencana modul `SEC` — **Security Operations/SIEM ala Wazuh** (HIDS/FIM/SCA, log+rule, kerentanan, insiden, active response, compliance) via capability agen `security`, + **ingest log `WEB`/nginx & syslog `NET`**. |
| [app_pam.md](app_pam.md) | Rencana modul `PAM` — **Bastion / Privileged Access (ala JumpServer)**: gateway SSH/SFTP/RDP/VNC, credential vault, RBAC per-aset, perekaman+replay sesi, live monitor, command filter, approval. |
| [app_web.md](app_web.md) | Rencana modul `WEB` — **Web server/reverse proxy + Domain & DNS (ala Nginx UI)**: site/stream/upstream/access-list, TLS+**ACME auto-renew**, **domain/WHOIS expiry**, record DNS. |
| [app_amm.md](app_amm.md) | Rencana modul `AMM` — **Asset Management & CMDB (ala GLPI/Snipe-IT)**: lifecycle, penugasan/mutasi, relasi CMDB, lisensi/software, garansi/maintenance, label QR, export Excel. |
| [app_sys.md](app_sys.md) | Rencana **admin lanjutan `APP06`–`APP11`**: notifikasi/template, integrasi HRIS/SSO, API key & webhook, audit & report, preferensi/branding, backup & restore. |

## 2. Ringkasan Status

Legenda: **Selesai** = DB + backend + frontend + dokumen + test; **DB selesai** =
skema & migrasi sudah ada, backend/frontend menyusul; **Sebagian** = sebagian
lapisan sudah ada; **Rencana** = belum dimulai.

| Prefix | Aplikasi | Kode | Status | Planning |
|---|---|---|---|---|
| `PUB` | Login / Auth (guest) | `PUB00` | Selesai | [modul](modules/pub00.md) |
| `APP` | Navigation shell | `APP00` | Selesai | [modul](modules/app00.md) |
| `APP` | Module (admin) | `APP01` | Selesai | [modul](modules/app01.md) |
| `APP` | Company (admin) | `APP02` | Selesai | [modul](modules/app02.md) |
| `APP` | User (admin) | `APP03` | Selesai | [modul](modules/app03.md) |
| `APP` | Signature (admin) | `APP04` | Selesai | [modul](modules/app04.md) |
| `APP` | Session / Token / Action (admin) | `APP05` | Selesai | [modul](modules/app05.md) |
| `SYS` | Session Profile | `SYS01`–`SYS03` | Selesai | [modul](modules/sys.md) |
| `APP` | Notification & Template (admin) | `APP06` | Rencana | [plan](app_sys.md) |
| `APP` | Integration Hub HRIS/SSO (admin) | `APP07` | Rencana | [plan](app_sys.md) |
| `APP` | API Key & Webhook (admin) | `APP08` | Rencana | [plan](app_sys.md) |
| `APP` | Audit & Report (admin) | `APP09` | Rencana | [plan](app_sys.md) |
| `APP` | Preference & Branding (admin) | `APP10` | Rencana | [plan](app_sys.md) |
| `APP` | Backup & Restore (admin) | `APP11` | Rencana | [plan](app_sys.md) |
| `AMM` | Asset Management & CMDB | — | DB selesai | [plan](app_amm.md) |
| `NET` | Network & MikroTik (firewall + SNMP) | — | DB selesai | [plan](app_net.md) |
| `VMS` | VM & Hypervisor Management | — | DB selesai | [plan](app_vms.md) |
| `SEC` | Security Operations / SIEM (ala Wazuh) | — | Rencana | [plan](app_sec.md) |
| `PAM` | Bastion / Privileged Access (ala JumpServer) | — | Rencana | [plan](app_pam.md) |
| `WAF` | Web Application Firewall | — | DB selesai | — |
| `WEB` | Web Server/Proxy + Domain & DNS | — | DB selesai | [plan](app_web.md) |
| `POD` | Container/Pod (K8s + Docker/Podman) | — | Sebagian | [plan](app_pod.md) |
| `JMS` | Job Management | — | DB selesai | — |
| `BOT` | Bot/Agent | — | DB selesai | — |
| `DSO` | DevOps/CI-CD | — | DB selesai | — |
| `OBS` | Observability (monitoring ala Beszel) | — | Sebagian | [plan](app_obs.md) |
| `DOC` | Document | — | DB selesai | — |

## 3. Konteks Cepat

- **APP00** bukan halaman, melainkan utilitas shell: login/logout (`PUB00`),
  daftar company, dan pohon modul untuk sidebar.
- Menu sidebar dibangun **dinamis** dari `app_module` + privilege
  `app_user_privilege` (level `HIDE/VIEW/BOOK/POST`); parent selalu tampil bila
  ada turunan non-`HIDE`.
- Setiap aplikasi admin mengikuti pola skeleton `osc_rest/skeleton/app/appNN/`
  (handler/usecase/repository/template) dan halaman `osc_site/.../APP/APPNN/`.
- Planning rinci tiap modul yang sudah ada: [modules/](modules/README.md).
- Detail teknis tiap komponen: [backend](../backend/README.md),
  [frontend](../frontend/README.md), [database](../database/README.md),
  [konvensi](../development/conventions.md).
