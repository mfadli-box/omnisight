# Technical Documentation: Wave 3 Frontend — SecOps & Vulnerability Center, PAM Bastion (Step-Up OTP, Web SSH Terminal, Session Replay), Notification Channel Settings

- **Date**: 2026-11-13
- **Author**: ai-site (Frontend & Security Architect)
- **Target Project**: `osc_site`
- **Upstream Rust API & Contract Reference**: `osc_docs/rest/api-w3.md` & `osc_docs/rest/contracts/w3.openapi.yaml`
- **Clean Architecture Layers Touched**: `domain`, `application`, `infrastructure`, `presentation`

## 1. Overview & Data Flow Architecture

Wave 3 frontend mengimplementasikan UI atas kontrak `osc_rest` Wave 3 (Hari 16 / SESI 4.1):

1. **SecOps & Vulnerability Center** — kartu hitungan (FIM unresolved / alert unack / CVE open), dashboard Security Alerts (badge severity + tag MITRE ATT&CK tactic/technique), FIM Change Logs (path, event, checksum lama→baru, sumber REALTIME/SCHEDULED), dan daftar CVE dikelompokkan per asset (CVSS, versi terpasang → fix).
2. **PAM Bastion & Web SSH Terminal** — daftar server target (akun vault, tanpa secret), alur otorisasi **mandatory MFA**: `403 MFA_REQUIRED_FOR_PAM` → prompt aktivasi MFA (tautan `/profile/security`); `403 PAM_STEP_UP_REQUIRED` → **modal Step-Up OTP** (shadcn `InputOTP`) → ulang authorize dengan `otp`; sukses → terminal interaktif **`xterm.js`** yang terhubung langsung ke `pam_bastion_gateway` dengan **ephemeral ticket** sekali-pakai (TTL ≤ 120 s), plus **Session Replay Viewer** (playback rekaman `.cast` asciinema v2 dengan speed 0.5–4x).
3. **Notification Channel Settings** — form SMTP Email / Telegram / Webhook per Company (satu channel per tipe), event filter picker, aktif/nonaktif & soft delete; config terenkripsi server-side sehingga UI hanya menampilkan ringkasan `has_*`.

Alur end-to-end tetap BFF murni (UI tidak pernah memanggil Rust API langsung):

```
UI (shadcn/ui, 'use client')
  -> application/usecases/w3.ts (varian badge, parser .cast, buildBastionWsUrl)
  -> infrastructure/api/gateways/w3-gateway.ts (Zod-validated, proxyFetch + X-Correlation-ID)
  -> Next.js API Proxy (/api/proxy/[...path], runtime nodejs, passthrough streaming)
  -> Rust API (osc_rest) via RUST_API_INTERNAL_URL (server-to-server)

Terminal PAM (pengecualian terkendali):
  xterm.js -> wss://<gateway>/ws/pam/{session_id}?ticket=<ephemeral> -> pam_bastion_gateway
  (ticket TTL pendek sekali-pakai; cookie/JWT TIDAK menyentuh koneksi WS)
```

Rute halaman dipetakan ke route_path menu `MenuModule` (seed) agar RouteGuard menghormati privilege per Company:

| Halaman | Route | Kode Menu (seed) |
| :--- | :--- | :--- |
| SecOps & Vulnerability Center | `/secops` | `secops.center` |
| PAM Bastion & Web SSH | `/pam` | `pam.bastion` |
| Notification Channel Settings | `/settings/notifications` | `notifications.channels` |

## 2. Clean Architecture Structure (`osc_site/src/`)

- **Domain (`domain/`)**: `entities/w3.ts` (`SecOpsCounts`, `SecurityAlertEvent`, `FimEvent`, `VulnerabilityFinding`, `SecOpsOverview`, `PamAccount`, `PamSession`, `PamAuthorizeResult`, union `PamAuthorizeOutcome` (authorized/mfa_required/step_up_required/policy_denied/error — error MFA dipetakan domain, bukan exception), `NotificationChannel` + `ChannelConfigSummary` ter-mask), `gateways/w3.ts` port `ISecOpsGateway`, `IPamGateway`, `INotificationGateway` — zero import React/fetch; re-export `domain/gateways.ts`.
- **Application (`application/usecases/w3.ts`)**: fungsi murni — `SEVERITY_VARIANT`/`PAM_STATUS_VARIANT` (badge), `formatBytes`/`formatDateTime`/`formatDuration`, `CHANNEL_LABELS`/`EVENT_FILTER_PRESETS`/`buildChannelConfig` (validasi bentuk config per tipe), `buildBastionWsUrl` (URL WS + ticket sebagai query; base dari `NEXT_PUBLIC_PAM_GATEWAY_WS_URL`), `parseCast`/`castDuration` (parser asciinema cast v2 untuk replay).
- **Infrastructure**: `api/gateways/w3-gateway.ts` (implementasi tiga port; `PamGateway.authorize` memetakan error envelope `MFA_REQUIRED_FOR_PAM`/`PAM_STEP_UP_REQUIRED`/`PAM_POLICY_DENIED` menjadi varian `PamAuthorizeOutcome`), `api/schemas.ts` (+skema Zod W3: secops overview/alerts/vulnerabilities, pam accounts/sessions/authorize result, notification channels), `security/proxy-policy.ts` (whitelist W3), `api/gateways/index.ts` (registrasi `secops`, `pam`, `notifications`).
- **Presentation & `app/`**: `components/secops/secops-client.tsx`, `components/pam/pam-client.tsx`, `components/pam/pam-terminal.tsx` (xterm.js terisolasi: dynamic import, ResizeObserver→FitAddon, dispose+close saat unmount), `components/pam/pam-replay-viewer.tsx`, `components/notifications/notifications-client.tsx`; halaman `app/(app)/secops`, `app/(app)/pam`, `app/(app)/settings/notifications`. Dependency baru: `@xterm/xterm@6`, `@xterm/addon-fit`.

## 3. API Proxy (BFF), Real-Time & Rust Upstream Mapping

Whitelist baru di `infrastructure/security/proxy-policy.ts` (default-deny; endpoint agent HMAC `/agents/security/ingest`, `/agents/pam/ticket/redeem`, `/agents/retention/purge`, `POST /pam/sessions/{id}/recording` TIDAK diberitakan lewat proxy browser):

| Next.js Proxy Route | Method | Upstream (`osc_rest`) | Auth / Handling | Payload / Stream |
| :--- | :--- | :--- | :--- | :--- |
| `/api/proxy/v1/secops/overview` | `GET` | `/secops/overview` | cookie → Bearer | JSON |
| `/api/proxy/v1/secops/alerts` | `GET` | `/secops/alerts` | cookie → Bearer | JSON |
| `/api/proxy/v1/secops/vulnerabilities` | `GET` | `/secops/vulnerabilities` | cookie → Bearer | JSON |
| `/api/proxy/v1/pam/accounts(/{id})` | `GET/POST/PUT/DELETE` | `/pam/accounts…` | cookie → Bearer; secret vault tidak pernah direspons | JSON |
| `/api/proxy/v1/pam/sessions/authorize` | `POST` | `/pam/sessions/authorize` | cookie → Bearer; `X-Forwarded-For` hop pertama untuk CIDR ACL upstream | JSON (`otp` saat step-up) |
| `/api/proxy/v1/pam/sessions(/{id})` | `GET` | `/pam/sessions…` | cookie → Bearer (anti IDOR) | JSON |
| `/api/proxy/v1/pam/sessions/{id}/recording` | `GET` | unduhan rekaman (bucket privat RustFS) | cookie → Bearer | binary stream |
| `/api/proxy/v1/notifications/channels(/{id})` | `GET/POST/PUT/DELETE` | `/notifications/channels…` | cookie → Bearer; config dienkripsi upstream | JSON |
| `wss://…/ws/pam/{session_id}?ticket=…` | WebSocket | `pam_bastion_gateway` | **ephemeral ticket** sekali-pakai (hasil authorize, TTL ≤ 120 s) | Terminal I/O frames |

- Route Handler `/app/api/proxy/[...path]/route.ts` tetap generik; dukungan rute W3 ditambahkan lewat whitelist `proxy-policy.ts` (prinsip default-deny dipertahankan).
- **WS langsung ke gateway**: sesuai pola BFF, browser memperoleh ticket via proxy (`POST /pam/sessions/authorize`), lalu terhubung ke `pam_bastion_gateway` hanya dengan ticket — cookie HttpOnly/JWT tidak pernah dibawa koneksi WS. Base gateway dikonfigurasi `NEXT_PUBLIC_PAM_GATEWAY_WS_URL` (default origin saat ini).

## 4. UI, Real-Time & Specifications (`shadcn/ui`)

- **SecOps Center** (`/secops`): `Card` hitungan (3 kartu), `Tabs` (Alerts / FIM / CVE), `Table` + `Badge` severity (destructive HIGH/CRITICAL), tag MITRE (tactic `Badge outline` + technique monospace), CVE digroup per asset (kartu per asset).
- **PAM Bastion** (`/pam`): tabel server target + tombol **Buka Sesi**; **Dialog Step-Up OTP** (`InputOTP` 6 digit; catatan rate-limit 5 gagal/15 menit); **Dialog/Alert prompt aktivasi MFA** (`MFA_REQUIRED_FOR_PAM` → tautan `/profile/security`); **Dialog terminal** berisi `PamTerminal` (xterm.js, binary frames arraybuffer → TextDecoder, echo status CONNECTED/closed); **Session Replay Viewer** (`PamReplayViewer`: play/pause, reset, speed 0.5x–4x, `Progress`, ANSI clear+home untuk restart; memuat rekaman via proxy GET).
- **Notification Settings** (`/settings/notifications`): `Tabs` per tipe channel, field bertipe (`Input[type=password]` untuk secret, `autocomplete=new-password`), `Switch` use_tls/is_active, picker `EVENT_FILTER_PRESETS` (Badge toggle, ≤32 entri), ringkasan channel ter-mask (`has_password`/`has_bot_token`/`has_secret` → "tersimpan ✓"), soft delete.
- Toast `sonner` untuk hasil mutasi; skeleton saat memuat; tidak ada `dangerouslySetInnerHTML` — seluruh output terminal/rekaman ditulis via `terminal.write` (tanpa injeksi DOM).

## 5. Security Controls & Threat Mitigation

- **Zero secret leakage di UI**: secret vault, password SMTP, bot token, webhook secret tidak pernah dikembalikan upstream (hanya `has_*`); ticket PAM sekali-tampil dan hanya hidup di memori komponen (hilang saat dialog ditutup).
- **Ephemeral ticket**: TTL ≤ 120 s, sekali-pakai (redeem atomik upstream); koneksi WS membawa ticket — bukan cookie/JWT; ticket kedaluwarsa/sudah ditebus → pesan error jelas.
- **SSRF / open proxy**: whitelist W3 default-deny; normalisasi anti-traversal per-segmen; endpoint agent HMAC & upload rekaman tidak diberitakan lewat proxy browser.
- **Mandatory MFA enforcement**: UI hanya mempermudah (prompt aktivasi + step-up OTP); penolakan otoritatif ada di osc_rest (`403 MFA_REQUIRED_FOR_PAM` tanpa kecuali, rate-limit OTP server-side).
- **CSRF**: Origin/Referer same-origin wajib untuk semua POST/PUT/DELETE via proxy.
- **XSS**: output terminal ditulis ke buffer xterm (bukan DOM string); pesan upstream dirender sebagai teks React; input OTP terbatas numerik via `InputOTP`.
- **Privilege menu (RBAC berlapis)**: middleware → RouteGuard per route_path menu → otorisasi final di osc_rest (tenant `active_company_id` dari sesi, anti IDOR).
- **Zod dua sisi**: seluruh respons W3 divalidasi skema sebelum masuk entitas; form channel dinormalisasi `buildChannelConfig` per tipe (webhook inline-credential dilarang upstream).
- **Memori & lifecycle**: terminal & socket di-dispose saat unmount; ResizeObserver terputus; timer replay di-clear.
