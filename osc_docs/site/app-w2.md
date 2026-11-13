# Technical Documentation: Wave 2 Frontend — NOC Command Center, Docker Stack Studio, Nginx Reverse Proxy Studio, Agent Enrollment & SSE Live Logs

- **Date**: 2026-11-13
- **Author**: ai-site (Frontend & Security Architect)
- **Target Project**: `osc_site`
- **Upstream Rust API & Contract Reference**: `osc_docs/rest/api-w2.md` & `osc_docs/rest/contracts/w2.openapi.yaml`
- **Clean Architecture Layers Touched**: `domain`, `application`, `infrastructure`, `presentation`

## 1. Overview & Data Flow Architecture

Wave 2 frontend mengimplementasikan UI atas kontrak `osc_rest` Wave 2 (Hari 12): NOC Command Center Dashboard (telemetri host + uptime + enrollment token), Docker Stack & Container Studio (editor `compose.yaml` + dispatch + SSE logs), Nginx Reverse Proxy Studio (vhost + SSL expiry + Test & Reload), serta halaman Agent Enrollment. Alur end-to-end tetap BFF murni:

```
UI (shadcn/ui, 'use client')
  -> application/usecases/infra.ts (privilege menu, derivasi metrik, SSL expiry, format)
  -> infrastructure/api/gateways/infra-gateway.ts (Zod-validated, proxyFetch + X-Correlation-ID)
     infrastructure/sse/logs-stream.ts (fetch-stream parser SSE, bukan EventSource)
  -> Next.js API Proxy (/api/proxy/[...path], runtime nodejs, passthrough streaming)
  -> Rust API (osc_rest) via RUST_API_INTERNAL_URL (server-to-server)
```

Rute halaman dipetakan ke **route_path menu `MenuModule` (seed)** agar RouteGuard (`isRouteAllowed`) otomatis menghormati privilege menu Company aktif; upstream tetap otoritatif (RBAC granular + tenant guard):

| Halaman | Route Menu (seed) | Kode Menu |
| :--- | :--- | :--- |
| NOC Command Center Dashboard | `/uptime/monitors` | `uptime.monitors` |
| Docker Stack & Container Studio | `/infra/compose` | `infra.compose` |
| Nginx Reverse Proxy Studio | `/infra/nginx` | `infra.nginx` |
| Agent Enrollment | `/admin/agents` | `admin.agents` |

## 2. Clean Architecture Structure (`osc_site/src/`)

- **Domain (`domain/`)**: `entities/infra.ts` (`EnrollmentTokenIssued`, `DockerHostRef`, `ComposeStack` + `StackCommand`, `NginxVhost` + `VhostStatus`, `UptimeMonitor`, `StatusPageRow`/`PublicStatusPage`/`PublicMonitorRollup`, `SseLogEvent`, enum `NODE_TYPES`/`LOG_LEVELS`), `gateways/infra.ts` port `IInfraGateway` (enrollment, docker, nginx, monitors/status pages) — **zero** import React/fetch; re-export di `domain/gateways.ts`.
- **Application (`application/usecases/infra.ts`)**: fungsi murni — `menuPrivilege(menus, code)` (gating CRUD dari pohon menu), `ratioPct`/`formatBytes`/`formatUptime`/`formatDateTime`, `numField`/`strField` (ekstraksi JSONB snapshot), `extractCertExpiry` + `sslExpiryState`/`sslExpiryRows` (EXPIRED / WARNING <30 hari / OK), `logLevelVariant`/`toLogLine` (cap 300 baris), template `COMPOSE_TEMPLATE`/`VHOST_TEMPLATE`, label dispatch & varian badge.
- **Infrastructure**: `api/gateways/infra-gateway.ts` (implementasi `IInfraGateway`, seluruh respons Zod-validated), `api/schemas.ts` (+20 skema Zod Wave 2: enrollment token, docker hosts/stacks/dispatch, nginx nodes/vhosts/dispatch, monitors, status pages, public status page), `validation/forms.ts` (+`enrollmentTokenFormSchema`, `stackCreate/Update/DispatchFormSchema` dengan `working_dir` anti traversal, `vhostCreate/UpdateFormSchema`), `sse/logs-stream.ts` (adapter SSE), `security/proxy-policy.ts` (whitelist W2), `api/rust-api.ts` (skip timeout untuk SSE long-lived), `api/gateways/index.ts` (registrasi `infra`).
- **Presentation & `app/`**: `components/infra/` (`noc-dashboard-client`, `docker-studio-client`, `nginx-studio-client`, `enrollment-token-card`, `log-stream-viewer`, `metric-card`), halaman `app/(app)/uptime/monitors`, `app/(app)/infra/compose`, `app/(app)/infra/nginx`, `app/(app)/admin/agents`, dan peta ikon sidebar (`app-sidebar.tsx`) untuk ikon menu baru (`activity`, `container`, `bell-ring`, `key-round`, `shield`, `settings`, `server`, `table-2`, `folder`).

## 3. API Proxy (BFF) & Rust Upstream Mapping (Wave 2)

Whitelist baru di `infrastructure/security/proxy-policy.ts` (default-deny; normalisasi anti-traversal per-segmen tetap berlaku):

| Next.js Proxy Route | Method | Upstream (`osc_rest`) | Auth / Handling | Payload / Stream |
| :--- | :--- | :--- | :--- | :--- |
| `/api/proxy/v1/agents/enrollment-tokens` | `POST` | `/agents/enrollment-tokens` | cookie → Bearer; gate admin upstream | JSON (token plaintext, sekali) |
| `/api/proxy/v1/monitors(/{id})` | `GET/POST/PUT/DELETE` | `/monitors…` | cookie → Bearer (RBAC menu Uptime) | JSON |
| `/api/proxy/v1/status-pages(/{id\|slug})` | `GET/POST/PUT/DELETE` | `/status-pages…` | `/{slug}` publik (proyeksi aman), lainnya Bearer | JSON |
| `/api/proxy/v1/docker/hosts` | `GET` | `/docker/hosts` | cookie → Bearer | JSON |
| `/api/proxy/v1/docker/stacks(/{id})` | `GET/POST/PUT/DELETE` | `/docker/stacks…` | cookie → Bearer; PUT memicu backup RustFS | JSON |
| `/api/proxy/v1/docker/stacks/{id}/dispatch` | `POST` | `…/dispatch` (`up\|down\|pull\|restart`) | cookie → Bearer → **202 QUEUED** | JSON |
| `/api/proxy/v1/nginx/nodes`, `/v1/nginx/vhosts(/{id})` | `GET/POST/PUT/DELETE` | idem | cookie → Bearer | JSON |
| `/api/proxy/v1/nginx/vhosts/{id}/dispatch` | `POST` | `test_reload` (agent `nginx -t && reload`) | cookie → Bearer → **202 QUEUED** | JSON |
| `/api/proxy/v1/infra/logs/stream` | `GET` | `/infra/logs/stream` | cookie → Bearer; **SSE `text/event-stream` passthrough tanpa timeout** | SSE stream (event `log`, `lagged`; keep-alive 15 s) |

- **SSE long-lived**: `forwardToRustApi()` kini melewati `AbortSignal.timeout(appConfig.timeoutMs)` khusus path `/api/v1/infra/logs/stream` — bukan vektor SSRF karena path tervalidasi whitelist dan host upstream konfigurasi tetap. Respons tetap dialirkan `upstream.body` langsung (tanpa buffering) + header allowlist (`content-type` lolos) + `cache-control: no-store`.
- **SSE client**: `infrastructure/sse/logs-stream.ts` memakai `fetch` + `ReadableStream` (bukan `EventSource`) agar `X-Correlation-ID` tersuntik, cookie HttpOnly same-origin terkirim, dan frame `event:`/`data:` diparse inkremental; event `lagged` ditampilkan sebagai peringatan (stream tidak diputus); `AbortController` menutup koneksi saat unmount/ganti referensi.
- **Endpoint agent HMAC tidak diberitakan**: `/agents/enroll`, `/agents/*/ingest`, `/agents/uptime/ingest`, `/agents/logs` sengaja tidak masuk whitelist — dipanggil langsung oleh agent `osc_auto` (HMAC, bukan JWT browser).

## 4. UI Specifications (`shadcn/ui`)

- **NOC Command Center Dashboard** (`/uptime/monitors` → `noc-dashboard-client.tsx`):
  - Grafik metrik host CPU/RAM/Disk: `MetricCard` (nilai terakhir + `Progress` + sparkline SVG murni tanpa dependency chart) dari snapshot `system_metric_snapshots` via Dynamic Query API `items/{collection}` (Studio, tenant-guarded); rincian `formatBytes` + host uptime.
  - **S.M.A.R.T. Health**: tabel `Table` (device, health PASSED/FAILED, suhu, reallocated sectors, power-on hours) dari `hardware_inventory_snapshots`.
  - **Uptime Monitors**: merge `GET /monitors` dengan rollup status page publik (`GET /status-pages/{slug}` untuk setiap `is_published`) → status UP/DOWN/PENDING (`MONITOR_STATUS_VARIANT`), ping, uptime % 24 jam, pesan heartbeat.
  - **SSL Certificate Expiry ringkas**: badge dari pesan heartbeat monitor HTTPS/KEYWORD (agent `network_poller_agent` menyertakan masa berlaku cert) — state EXPIRED/WARNING(<30d)/OK.
  - **Agent Enrollment Token** (`enrollment-token-card.tsx`): form `Select` node_type (6 enum) + TTL jam (1–72, Zod clamp) → `POST /agents/enrollment-tokens` → `Alert` sekali-tampil token hex-64 monospace `select-all` + perintah `osc_auto --enroll …`. **Privilege**: form hanya muncul bila menu `admin.agents` `can_create` pada Company aktif (dihitung internal via `useNavigationContext`), selain itu Alert "butuh privilege".
- **Docker Stack & Container Studio** (`/infra/compose` → `docker-studio-client.tsx`): Tabs Stacks/Live Logs; tabel stack (host, working_dir, drift badge, last deployed); panel editor `Textarea` monospace `compose.yaml` (dimuat dari detail GET; `compose_content` tidak ada di list), env override `Input[type=password]` (dienkripsi Envelope upstream, ciphertext tidak pernah diekspos), tombol **Simpan** (PUT → backup otomatis RustFS), **Deploy/Up · Pull · Restart · Stop/Down** (dispatch 202 + toast `dispatch_ref`), **Hapus** (soft delete) — semua gated `menuPrivilege('infra.compose')` can_create/update/delete; Live Logs = `LogStreamViewer` scope `docker_stack` dengan pemilih referensi stack.
- **Nginx Reverse Proxy Studio** (`/infra/nginx` → `nginx-studio-client.tsx`): kartu **SSL Certificate Expiry** (sumber rollup monitor HTTPS/KEYWORD; kosong bila privilege Uptime tidak memungkinkan — fetch defensif); tabel vhost (server_name, node, port, status pipeline DRAFT/TESTING/APPLIED/FAILED/ROLLED_BACK, badge SSL, applied_at); editor config `server {…}` + SSL cert/key path; tombol **Simpan Config** (PUT; status kembali DRAFT, config lama dibackup), **Test & Reload** (dispatch `test_reload`), **Hapus**; Live Logs scope `nginx_vhost`; dialog create (CONFLICT 409 → pesan kombinasi unik).
- **Agent Enrollment** (`/admin/agents`): generator token + dokumentasi alur enrollment 3 langkah (token → enroll → HMAC headers).
- Editor memakai `Textarea` monospace (tanpa dependency CodeMirror); tidak ada `dangerouslySetInnerHTML`; semua pesan upstream dirender teks.

## 5. Security Controls & Threat Mitigation

- **Token isolation**: JWT tetap hanya di cookie HttpOnly/Secure/SameSite=Lax; tidak ada secret baru di browser — token enrollment & `hmac_secret` tidak pernah disimpan UI (token hanya memori state komponen, hilang saat re-render penuh).
- **SSRF / open proxy**: whitelist W2 default-deny (semua endpoint di atas teregistrasi eksplisit); normalisasi anti-traversal per-segmen; endpoint agent HMAC tidak diberitakan lewat proxy browser.
- **SSE**: stream passthrough tanpa buffering + tanpa timeout server-side; pemutusan dikendalikan upstream/`AbortController` klien; event difilter tenant server-side (event company lain tidak pernah sampai subscriber).
- **CSRF**: Origin/Referer same-origin tetap wajib untuk semua dispatch/PUT/POST/DELETE.
- **Privilege menu (RBAC berlapis)**: middleware edge (cookie) → Server Component layout (`/me/navigation`) → RouteGuard `isRouteAllowed` per route_path menu → gating granular per tombol (`menuPrivilege` can_create/update/delete) → otorisasi final di osc_rest.
- **Input Zod dua sisi**: form (enrollment, stack, vhost) + respons upstream divalidasi Zod; `working_dir` ditolak lebih awal bila mengandung `..`/`~`/`\` (gerbang klien; validator `infra_validate.rs` tetap otoritatif).
- **Injeksi**: UI tidak pernah membangun command — dispatch hanya enum allowlist `up|down|pull|restart` / `test_reload`; eksekusi shell terjadi di agent dengan validasinya sendiri (zero command-injection di API & UI).
- **Memori & XSS**: cap 300 baris log di browser; semua konten log dirender sebagai teks React.

## 6. Verification

```bash
cd osc_site
npx tsc --noEmit   # ✅ 2026-11-13 (exit 0, strict, no `any`)
npm run lint       # ✅ 2026-11-13 (exit 0)
npm run build      # ✅ 2026-11-13 (16/16 route — +4: /uptime/monitors, /infra/compose, /infra/nginx, /admin/agents)
```

> Catatan: data telemetri & monitor bergantung ingest agent Wave 2 (`host_telemetry_agent`, `network_poller_agent`, `infra_control_agent` — SESI 3.2). Bila koleksi Studio telemetri belum terdaftar atau belum ada heartbeat, dashboard menampilkan empty state yang jelas tanpa error.
