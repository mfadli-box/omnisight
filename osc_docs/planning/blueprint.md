# Blueprint — Cetak Biru OmniSight

> Gambaran arsitektur dan prinsip yang mengikat seluruh aplikasi OmniSight.
> Blueprint ini menjadi rujukan saat menambah modul baru.

## 1. Visi

OmniSight adalah platform terintegrasi untuk pemantauan, keamanan, dan
operasional infrastruktur. Platform menyatukan banyak domain (aset/CMDB,
jaringan, VM, WAF/SIEM, container, web/domain, **bastion/PAM**, job,
observability, dokumen) dalam **satu konsol dengan model otorisasi dan navigasi
yang seragam**.

Prinsip inti:

1. **Modular & module-driven** — setiap kemampuan adalah aplikasi ber-prefix
   kode 3 huruf yang didaftarkan ke `app_module`.
2. **Multi-company (multi-tenant)** — data dan hak akses terikat pada company.
3. **Least privilege** — akses per modul diatur eksplisit lewat privilege.
4. **Auditable** — semua mutasi admin terekam di `app_user_action`.
5. **Satu sumber kebenaran skema** — database didefinisikan via Prisma.

## 2. Stack & Topologi

| Komponen | Teknologi | Port | Peran |
|---|---|---|---|
| `osc_base` | Prisma + PostgreSQL (docker `osc_base`) | `37771` (host) | Skema, migrasi, seed |
| `osc_rest` | Go + Gin | `37772` | REST API, otorisasi, **gateway tunggal ke DB** |
| `osc_site` | Next.js (App Router) | `37773` | UI board & proxy ke backend |
| `osc_auto` | Go (agen) | — | Agen per-VM & runner; **tidak** akses DB |

```
Browser ──► osc_site (:37773) ──/proxy/*──► osc_rest (:37772) ──pgx──► PostgreSQL (:5432)
                                               ▲
        Agen per-VM (osc_auto) ──/rest/agent───┘  (mTLS + token bot_agent)
```

Frontend **tidak** memanggil backend langsung dari browser; ia memakai route
proxy internal (`/proxy/pages/*`) yang meneruskan `Authorization` dan
`X-Company-ID`.

**Agen (`osc_auto/`)** — ditanam di setiap VM dan **hanya** berbicara dengan
`osc_rest` (grup `/rest/agent`, `USBots()`, mTLS + token `bot_agent`). Agen
**tidak pernah** terhubung ke database; `osc_rest` adalah satu-satunya
penghubung ke DB. Agen mengekspos kemampuan sesuai modul (mis. akses
Docker/Podman untuk `POD`, akses **RouterOS/MikroTik + SNMP** untuk `NET`,
koleksi metrik host/container **+ VM host (hypervisor)** untuk `OBS`, **manajemen
VM** untuk `VMS`, **keamanan endpoint (HIDS/FIM/SCA)** untuk `SEC`, **akses
bastion (SSH/RDP/VNC relay)** untuk `PAM`, **web server/nginx** untuk `WEB`,
runner build untuk `DSO`). Folder scaffold yang **dipakai**: `osc_auto/agent_vm` (per-VM),
`agent_ci` (runner CI). `agent_ws` & `agent_mx` **belum diperlukan** (TBD) —
tidak dirancang untuk saat ini.

## 3. Arsitektur Otorisasi & Navigasi

- **Auth token**: login (`POST /rest/guest/PUB00`) menghasilkan token di
  `app_user_token`. Middleware `USLoad()`/`USAuth()` memuat sesi + user +
  company aktif.
- **Company aktif**: ditentukan `X-Company-ID`; divalidasi terhadap
  `app_user_company`.
- **Admin** (`is_admin`): melewati pengecekan privilege (`USLock()`).
- **Privilege per modul**: `app_user_privilege.level` ∈ `HIDE | VIEW | BOOK | POST`.
  Middleware `USRole(moduleCode, level)` memeriksa akses.
- **Pohon menu**: `GET /rest/pages/APP00/module` mengembalikan modul aktif per
  company, difilter privilege untuk non-admin. **Semua leluhur (parent) tetap
  disertakan** bila ada minimal satu turunan non-`HIDE` (recursive ancestor
  walk), agar grup sidebar tidak hilang.
- **Sinkronisasi tautan otomatis** (`applink`): saat membuat company/module/user,
  baris `app_company_module`, `app_user_company`, dan `app_user_privilege`
  dibuat otomatis (default non-aktif / `HIDE`) dalam transaksi yang sama.

## 4. Konvensi Kode Modul

Prefix dipakai untuk pemetaan ikon & pengelompokan di frontend serta penamaan
endpoint. Daftar lengkap ada di
[konvensi](../development/conventions.md#4-kode-modul-field-code).

| Prefix | Domain | Rentang kode |
|---|---|---|
| `APP` | Application (admin) | `APP01`–`APP11` |
| `SYS` | Session Profile | `SYS01`–`SYS03` |
| `AMM` | Asset Management | `AMM01`.. |
| `NET` | Network Monitoring & MikroTik (firewall) | `NET01`.. |
| `VMS` | VM & Hypervisor Management | `VMS01`.. |
| `SEC` | Security Operations / SIEM (HIDS/SIEM/XDR) | `SEC01`.. |
| `PAM` | Bastion / Privileged Access Management | `PAM01`.. |
| `WAF` | Web Application Firewall (perimeter) | `WAF01`.. |
| `WEB` | Web Server/Proxy + Domain & DNS | `WEB01`.. |
| `POD` | Container/Pod (K8s + Docker/Podman) | `POD01`.. |
| `JMS` | Job Management | `JMS01`.. |
| `BOT` | Bot/Agent | `BOT01`.. |
| `DSO` | DevOps/CI-CD | `DSO01`.. |
| `OBS` | Observability | `OBS01`.. |
| `DOC` | Document | `DOC01`.. |
| `TIM` | Tim & Kolaborasi (Chat + Mail) | `TIM01`.. |

## 5. Konvensi Database (Cluster)

- Satu file Prisma = satu cluster = satu dokumen `cluster_<nama>.md`.
- Prefix tabel per cluster: `app_*` (aplikasi/admin), `amm_*`, `net_*`,
  `sec_*`, `pam_*`, `obs_*`, `pod_*`, `web_*`, `vms_*`, `jms_*`, `doc_*`,
  `dso_*`, `bot_*`, `tim_*` (tim & kolaborasi: chat + mail).
- Konvensi model: id `uuid`, kolom audit `created_at`/`updated_at`,
  `is_active` untuk soft state, uniqueness per company
  (`@@unique([company_id, code])`).
- Retensi data telemetri/log diatur `osc_rest/backbone/retention.go` (env
  `RE_DAYS_*`).

## 6. Pola Implementasi

### 6.1 Backend (`osc_rest/skeleton/app/appNN/`)

```
appNN/
├── appNN_handler.go      # binding HTTP, format respons
├── appNN_usecase.go      # aturan bisnis & validasi, Use(pg)
├── appNN_repository.go   # SQL (pgx), grid list, transaksi
└── appNN_template.go     # DTO request/response
```

- Didaftarkan di `backbone/routes.go` dengan `appNN.Use(PgSQL)` lalu route
  `admin.*` / `auths.*`.
- Grid list memakai `mechanic.GridParams` → `mechanic.Page` (field `Rows`).
- Mutasi admin otomatis tercatat oleh `USLogs("")` (module dari segmen path).

### 6.2 Frontend (`osc_site/.../APP/APPNN/`)

```
APPNN/
├── page.tsx              # halaman + tab
├── api.ts                # panggilan proxy + tipe
├── schemas.ts            # skema zod
└── components/           # *-table.tsx, *-form.tsx, *-tab.tsx
```

- Tabel memakai `@/uix/datatable` (`DataTable`, `Column`, `ActionConfig`) dan
  helper `@/lib/grid` (`gridFetch`/`listFetch`).
- Form memakai `DataDialog` + zod; komponen form di-*remount* via `key` untuk
  mereset state (bukan `setState` di dalam `useEffect`).

## 7. Layanan Lintas-Modul

| Layanan | Lokasi | Fungsi |
|---|---|---|
| `applink` | `osc_rest/skeleton/app/applink/` | Auto-insert tautan admin (company_module / user_company / user_privilege). |
| `USLogs` | `osc_rest/backbone/memory.go` | Audit mutasi admin → `app_user_action`. |
| `USRole` | `osc_rest/backbone/memory.go` | Cek privilege modul. |
| Retention | `osc_rest/backbone/retention.go` | Purge data telemetri/log terjadwal. |
| Upload | `osc_rest/backbone/upload.go` | Handler unggah (belum diregistrasi). |
| Agent gateway | `osc_rest` grup `/rest/agent` (`USBots()`) | Jembatan agen `osc_auto` → DB; agen tak pernah akses DB. |
| Agen | `osc_auto/agent_*` | Biner per-VM (engine `POD`, RouterOS+SNMP `NET`, metrik `OBS` + VM host, VM `VMS`, keamanan `SEC`, relay `PAM`, nginx `WEB`, runner `DSO`). |

## 8. Di Luar Cakupan (Non-Goals)

- Tidak menggantikan tool pihak ketiga secara fungsional penuh; OmniSight
  berperan sebagai konsol agregasi & orkestrasi.
- Autentikasi eksternal (SSO/OIDC) belum termasuk fase awal.
- Multi-bahasa penuh belum termasuk fase awal (dokumen berbahasa Indonesia).
