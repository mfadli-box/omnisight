# Technical Documentation: Wave 1 Frontend — Secure BFF Proxy, Login Dual-Mode & MFA, Company Switcher, Dynamic App Shell, ITAM/DCIM/IPAM/Studio & Excel UI

- **Date**: 2026-11-12
- **Author**: ai-site (Frontend & Security Architect)
- **Target Project**: `osc_site`
- **Upstream Rust API & Contract Reference**: `osc_docs/rest/api-w1.md` & `osc_docs/rest/contracts/w1.openapi.yaml`
- **Clean Architecture Layers Touched**: `domain`, `application`, `infrastructure`, `presentation`

## 1. Overview & Data Flow Architecture

Wave 1 frontend mengimplementasikan UI penuh atas kontrak `osc_rest` Wave 1 (Hari 9): login dual-mode HRIS/Local, TOTP MFA (challenge 2 langkah + reset), Company Switcher, sidebar dinamis dari `MenuModule`, Studio/ITAM/DCIM/IPAM, file RustFS, serta Excel import/export streaming. Alur end-to-end:

```
UI (shadcn/ui, RSC/'use client')
  -> application/ usecase (login state machine, nav guard, excel workflow)
  -> infrastructure/ gateway (Zod-validated, proxyFetch + X-Correlation-ID)
  -> Next.js API Proxy (/api/proxy/[...path], runtime nodejs)
  -> Rust API (osc_rest) via RUST_API_INTERNAL_URL (server-to-server)
```

Aturan tetap: **browser tidak pernah berbicara langsung dengan `osc_rest`**; JWT hanya berpindah lewat cookie `HttpOnly`/`Secure`/`SameSite=Lax` dan **di-strip dari setiap body respons** (termasuk `access_token`, `mfa_challenge_token`, `token_type`).

### Struktur Clean Architecture (`osc_site/src/`)

| Layer | Isi Wave 1 |
| :--- | :--- |
| `domain/entities/` | `auth.ts` (CompanyPublic, UserSummary, LoginOutcome, CompanyAccess, MenuNode, NavigationData, MfaSetupData), `itam.ts` (Asset, SoftwareLicenseRow, TicketRow, ImportRowError/Summary + enum), `net.ts` (Rack/Prefix/Address), `studio.ts` (CollectionMeta, FieldMeta, DynamicItem, FileAssetMeta) |
| `domain/gateways/` | Port `IAuthGateway`/`IMeGateway`, `IItamGateway`, `INetGateway`, `IStudioGateway`, `IFileGateway`, `IExcelGateway` — **zero** import React/Next/fetch |
| `application/usecases/` | `login.ts` (state machine dual-mode + step-2 MFA, `identityLabel()` dinamis), `navigation.ts` (`allowedRoutePaths`, `isRouteAllowed` — guard murni), `excel.ts` (validasi pra-upload ekstensi/MIME/10 MB + orkestrasi import) |
| `infrastructure/` | `api/rust-api.ts` (forwarder + intercept cookie auth + strip token + propagasi correlation), `api/client.ts` (apiJson/apiUploadWithProgress XHR/downloadBinary), `api/schemas.ts` (Zod respons kontrak w1), `api/gateways/*` (implementasi port), `api/server-api.ts` (fetch server component: `cookies()` → Bearer), `security/proxy-policy.ts` (whitelist W1 + sanitasi filename + correlation), `security/session.ts` (cookie `osc_session` + `osc_mfa_challenge`), `validation/forms.ts` (Zod form) |
| `presentation/` & `app/` | `app/(app)/layout.tsx` (server shell), `app/login/page.tsx`, halaman fitur, `components/ui/*` (input, label, card, dialog, popover, command/cmdk, select, tabs, switch, progress, table, badge, alert, skeleton, input-otp), `components/auth/login-form.tsx`, `components/layout/*` (sidebar, switcher, user-menu, route-guard), `components/excel/*`, `components/assets|licenses|tickets|network|studio|files|security/*` |

## 2. Secure API Proxy (BFF) — `/api/proxy/[...path]/route.ts`

Route handler tetap tipis (`runtime: 'nodejs'`, `dynamic: 'force-dynamic'`) dan mendelegasikan ke `forwardToRustApi()`. Penambahan Wave 1:

1. **Whitelist path W1 (default-deny, anti-SSRF)** — `proxy-policy.ts` sekarang mendaftarkan seluruh endpoint kontrak: `auth/{companies,login,logout,switch-company}`, `auth/mfa/{setup,enable,verify,disable,reset-request,reset-confirm}`, `me/navigation`, `collections(/{c}/fields)`, `items/{c}`, `assets(/{id},/{id}/checkout,/{id}/checkin,/import,/export)`, `licenses`, `tickets`, `dcim/racks`, `ipam/{prefixes,addresses}`, `files(/{id})`. Normalisasi anti-traversal per-segmen dipertahankan (`.`/`..`/backslash/NUL/encoding tidak valid → 400).
2. **Propagasi `X-Correlation-ID`** — dibaca dari klien bila wajar (maks 64 char, `[\w.-]`), selain itu di-generate UUID; selalu disetel ke header upstream **dan** di-echo pada respons. Klien (`client.ts`) juga menyuntik UUID per request.
3. **Intercept respons auth (token → cookie HttpOnly)** — `POST login`, `auth/mfa/verify`, `auth/switch-company`, `auth/logout` di-buffer (JSON kecil):
   - `login` + `mfa_required: true` → challenge JWT disetel ke cookie `osc_mfa_challenge` (HttpOnly, TTL 5 menit), body distrip; login sukses → cookie `osc_session` (HttpOnly, TTL 24 jam) + hapus challenge.
   - `mfa/verify` sukses → cookie `osc_session` baru + hapus challenge.
   - `switch-company` sukses → **rotasi** cookie `osc_session` dengan JWT klaim company/role baru.
   - `logout` → kedua cookie dihapus.
   - Fungsi `sanitizeAuthPayload()` menghapus `access_token`, `mfa_challenge_token`, `token_type` dari body sebelum respons dibangun — token tidak pernah sampai ke bundle browser.
4. **Passthrough streaming dua arah** — body `ReadableStream` request diteruskan tanpa buffering (`duplex: 'half'`) untuk multipart import/upload file; respons upstream (export `.xlsx`) dialirkan langsung ke browser tanpa `arrayBuffer()`.
5. **CSRF** — Origin/Referer same-origin (`SITE_PUBLIC_URL`) wajib untuk semua method mutating; **header allowlist** (`accept`, `accept-language`, `content-type`, `x-correlation-id`); `cookie`/`host`/`x-forwarded-*` tidak pernah diteruskan; `set-cookie` upstream dibuang.
6. **Sanitasi filename** — `sanitizeFilename()` menyarakan `Content-Disposition` (Excel export/RustFS) sebelum dipakai di browser.

## 3. API Proxy (BFF) & Rust Upstream Mapping (Wave 1)

| Next.js Proxy Route | Method | Upstream (`osc_rest`) | Auth / Cookie Handling | Payload / Stream |
| :--- | :--- | :--- | :--- | :--- |
| `/api/proxy/v1/auth/companies` | `GET` | `/api/v1/auth/companies` | publik | JSON |
| `/api/proxy/v1/auth/login` | `POST` | `/api/v1/auth/login` | publik → set `osc_session` / `osc_mfa_challenge` (HttpOnly), token di-strip | JSON |
| `/api/proxy/v1/auth/mfa/{setup,enable,disable}` | `POST` | idem upstream | cookie → Bearer | JSON |
| `/api/proxy/v1/auth/mfa/verify` | `POST` | `/auth/mfa/verify` | challenge cookie → Bearer scope=mfa_pending → set `osc_session` | JSON |
| `/api/proxy/v1/auth/mfa/{reset-request,reset-confirm}` | `POST` | idem (publik, anti-enumeration) | tanpa token | JSON |
| `/api/proxy/v1/auth/switch-company` | `POST` | `/auth/switch-company` | cookie → Bearer → rotasi cookie | JSON |
| `/api/proxy/v1/auth/logout` | `POST` | `/auth/logout` | clear cookie | JSON |
| `/api/proxy/v1/me/navigation` | `GET` | `/me/navigation` | cookie → Bearer | JSON |
| `/api/proxy/v1/{collections,items/{c},assets,licenses,tickets,dcim/racks,ipam/{prefixes,addresses},files}` | `GET/POST` | idem | cookie → Bearer | JSON |
| `/api/proxy/v1/assets/{id}/{checkout,checkin}` | `POST` | idem (FOR UPDATE + re-check) | cookie → Bearer | JSON |
| `/api/proxy/v1/assets/import` | `POST` | `/assets/import` (calamine, spawn_blocking) | cookie → Bearer | `multipart/form-data` passthrough |
| `/api/proxy/v1/assets/export` | `GET` | `/assets/export` (rust_xlsxwriter) | cookie → Bearer | `.xlsx` binary stream |
| `/api/proxy/v1/files` / `/v1/files/{id}` | `GET/POST` | idem | cookie → Bearer | multipart passthrough / JSON presigned |

Server Components tidak memanggil proxy HTTP diri-sendiri — `infrastructure/api/server-api.ts` melakukan fetch server-to-server (`cookies()` → `Authorization: Bearer`) dipakai `app/(app)/layout.tsx` (navigasi) dan `app/page.tsx` (redirect sesi).

## 4. UI & Excel Specifications (`shadcn/ui`)

### 4.1 Login Dual-Mode & MFA (`/login`, `login-form.tsx`)
- Dropdown company (`Select` radix) dengan **opsi default `"Local / Global Login"` bernilai `""`** (`company_id` kosong = default access / Local Login). Daftar company diambil server-side (endpoint publik) + fallback klien.
- **Label dinamis**: `hris_enabled: true` → `HRIS ID`, else `Username` (via `identityLabel()`).
- Respons `mfa_required: true` → transisi otomatis ke **`InputOTP` 6 digit** (`input-otp` + slot shadcn) dan tombol **"Gunakan Backup Code"** (sekali pakai → MFA auto-reset di upstream) serta dialog **"Reset MFA"** (`reset-request` username+email → `reset-confirm` username+token, anti user-enumeration).
- Error upstream ditampilkan sebagai `Alert` dengan kode asli (`RATE_LIMITED`, `HRIS_UPSTREAM_INVALID_RESPONSE`, dsb.).

### 4.2 App Shell Dinamis (`app/(app)/layout.tsx`)
- **Company Switcher** (header): `Popover` + `Command` (cmdk) — memanggil `/api/proxy/v1/auth/switch-company`, toast sukses, lalu `router.refresh()` agar seluruh RSC me-render ulang dalam konteks tenant baru.
- **Sidebar dinamis**: pohon `MenuNode` dari `GET /me/navigation` (server-side filtering — `can_view=false` tidak pernah dikirim upstream), ikon lucide dipetakan dari kolom `icon`.
- **Route Guard**: `middleware.ts` (edge: cookie sesi wajib untuk path terproteksi) + `RouteGuard` klien (`isRouteAllowed()` membandingkan pathname dengan `route_path` menu + route statis `/dashboard`, `/profile/security`) → kartu 403.
- **Profil Keamanan** (`/profile/security`): setup TOTP (**QR code** data-URL dari `otpauth://` via `qrcode`, secret base32, 10 backup code pada `Alert` sekali-tampil) → `InputOTP` 6 digit → enable; disable dengan password + OTP (doubleCheckPassword upstream).

### 4.3 Modul UI Wave 1
- **Manajemen Aset** (`/assets`): tabel aset, dialog create (`AssetCreate` — enum node_type/status, IP divalidasi Zod), **Check-Out Modal** (target user + expected check-in; 409 → pesan "aset sudah ter-assign") dan **Check-In** (400 → "tidak sedang assigned").
- **Software Licenses** (`/licenses`): tabel + progress seat usage; kunci tidak pernah diekspos (hanya `has_key`).
- **Helpdesk Tickets** (`/tickets`): tabel (kode `TK-NNNNNN`) + create dialog (type/priority enum).
- **DCIM/IPAM Explorer** (`/network`): Tabs Racks (progress okupansi U), Prefixes (form CIDR IPv4; 409 → "prefix overlap"), Addresses.
- **Dynamic Collection Explorer** (`/studio`): daftar koleksi (pill), metadata field (badge, `*` = required), tabel item kolom dinamis dari JSONB, dialog create koleksi (regex `^[a-z][a-z0-9_]{0,49}$`) & item (field terdaftar saja).
- **File RustFS** (`/files`): tabel metadata (nama, MIME, ukuran, SHA-256), upload multipart ≤ 25 MB dengan `Progress` XHR, akses via presigned URL TTL 300 s.

### 4.4 Excel Import/Export
- **Import Modal**: validasi klien (ekstensi `.xlsx/.xls`, MIME allowlist, maks 10 MB, bukan kosong) → upload XHR dengan **progress bar** (`Progress` shadcn, event `xhr.upload.onprogress`) → fase "Server memproses (calamine)" → `Alert` ringkasan (`inserted`, `error_count`) → **tabel error per baris** (Baris, Kolom, Kode `REQUIRED|TOO_LONG|ENUM_INVALID|IP_INVALID|NUMBER_INVALID|DUPLICATE`, Pesan) — cap 100 error.
- **Export**: `GET /assets/export` streaming — proxy meneruskan binary langsung; klien membungkus stream menjadi `Blob`, filename disanitasi dari `Content-Disposition`, `URL.revokeObjectURL()` dijalankan setelah anchor diklik.

## 5. Security Controls & Threat Mitigation

- **Token isolation**: JWT hanya di cookie `HttpOnly`/`Secure` (prod)/`SameSite=Lax`; challenge MFA cookie terpisah TTL 5 menit; token di-strip dari semua body auth; tidak ada `NEXT_PUBLIC_*` sensitif; token tidak pernah ke `localStorage`.
- **SSRF / open proxy**: base URL upstream konfigurasi tetap; path whitelist default-deny (seluruh endpoint W1 teregistrasi); normalisasi anti-traversal per-segmen.
- **CSRF**: Origin/Referer same-origin pada semua method mutating + cookie `SameSite=Lax`.
- **Correlation tracing**: `X-Correlation-ID` di-propagasi klien → proxy → osc_rest dan di-echo ke browser.
- **Streaming**: passthrough dua arah tanpa buffering (multipart upload, export xlsx) + pre-check `Content-Length` (413).
- **XSS/Zod**: tidak ada `dangerouslySetInnerHTML`; semua payload form & respons upstream divalidasi Zod; `ApiClientError` tipe-aman menyandikan kode error upstream.
- **RBAC berlapis**: middleware edge (cookie) → re-verifikasi Server Component (`/me/navigation`, redirect 401) → `RouteGuard` UI berbasis pohon menu; otorisasi final tetap di osc_rest (tenant guard + anti-IDOR).
- **Security headers**: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP, HSTS di `next.config.ts`; proxy memasang `Cache-Control: no-store` pada semua respons.

## 6. Verification

```bash
cd osc_site
npx tsc --noEmit   # ✅ 2026-11-12 (exit 0, strict, no `any`)
npm run lint       # ✅ 2026-11-12 (exit 0 — @typescript-eslint + @next/next + react-hooks)
npm run build      # ✅ 2026-11-12 (11/11 route ter-generate)
```

> Catatan toolchain: `typescript-eslint` belum mendukung TypeScript 7 (native) — issue typescript-eslint #10940. Proyek berjalan pada `typescript@6.0.3` (compiler JS terakhir) agar `tsc --noEmit` **dan** ESLint sama-sama lolos; upgrade ke TS 7 dapat dilakukan begitu dukungan parser tersedia.
