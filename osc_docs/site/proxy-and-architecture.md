# Technical Documentation: Proxy (BFF) & Architecture Foundation

- **Date**: 2026-11-11
- **Author**: ai-site (Frontend & Security Architect)
- **Target Project**: `osc_site`
- **Upstream Rust API Reference**: `osc_docs/rest/api-core-foundation.md`
- **Clean Architecture Layers Touched**: `domain`, `application`, `infrastructure`, `presentation`

## 1. Overview & Data Flow Architecture

Fondasi frontend omnisight: **Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui** dengan BFF proxy sebagai satu-satunya pintu ke Rust API. Alur:

```
UI (shadcn/ui, RSC) -> application/ usecase -> infrastructure/ gateway
  -> Next.js API Proxy (/api/proxy/[...path], runtime nodejs)
  -> Rust API (osc_rest) via RUST_API_INTERNAL_URL (DNS internal compose)
```

Aturan besi-bera: **browser tidak pernah berbicara langsung dengan `osc_rest`**; URL internal, secret, dan raw JWT tidak pernah sampai ke bundle browser (tidak ada `NEXT_PUBLIC_*` yang sensitif).

### Struktur Clean Architecture (`osc_site/src/`)

| Layer | Isi | Batasan |
| :--- | :--- | :--- |
| `domain/` | `entities.ts` (User, ApiHealthSnapshot), `errors.ts` (DomainError, ApiErrorEnvelope), `gateways.ts` (`IBackendGateway`) | **Zero** import React/Next/fetch/UI |
| `application/` | `usecases/ping-backend.ts` (terima gateway via port) | Hanya bergantung pada `domain/` |
| `infrastructure/` | `config.ts` (env tervalidasi), `api/rust-api.ts` (BFF forwarder), `api/backend-gateway.ts` (implement `IBackendGateway`, client-side + Zod), `http/proxy-client.ts`, `security/proxy-policy.ts`, `security/session.ts` | Detail teknis; boleh import next/server |
| `presentation/` & `app/` | `app/{layout,page,globals.css}`, `app/api/health/route.ts`, `app/api/proxy/[...path]/route.ts`, `presentation/components/ui/button.tsx` (cva), `presentation/lib/utils.ts` (cn) | Catatan: App Router wajib berada di `src/app` (batasan framework); route handler = bagian presentation |

`components.json` (shadcn CLI) mengarah ke alias `@/presentation/components|ui|lib|hooks` agar komponen yang di-generate CLI tetap di layer presentation.

## 2. Secure API Proxy — `/api/proxy/[...path]`

Route handler tipis (`runtime: 'nodejs'`, `dynamic: 'force-dynamic'`) yang mendelegasikan seluruh logika ke `forwardToRustApi()`:

1. **Method allowlist** — `GET/HEAD/POST/PUT/PATCH/DELETE`; lainnya `405 METHOD_NOT_ALLOWED`.
2. **Normalisasi path anti-traversal** — decode per-segmen; tolak `.`, `..`, backslash, NUL, segmen kosong, %-encoding tidak valid → `400 INVALID_PATH`. Path upstream dibentuk ulang via `encodeURIComponent` (tidak pernah dari input mentah) dan **selalu ber-awalan `/api/`** — mapping gateway: `/api/proxy/<X>` → `/api/<X>` (terverifikasi end-to-end pada Fase 6; sebelum fix, tanpa prefix ini seluruh request ditolak `404 PATH_NOT_ALLOWED` karena whitelist ditulis dalam bentuk kontrak upstream).
3. **Path whitelist (default-deny, proteksi SSRF/open-proxy)** — hanya pola terdaftar di `proxy-policy.ts`:
   | Upstream path | Status |
   | :--- | :--- |
   | `/api/v1/health` | aktif |
   | `/api/v1/auth/(login\|refresh\|logout)` | siap (fase auth) |
   | `/api/v1/users(/id)` | contoh CRUD (fase fitur) |
   | `/api/v1/excel/<domain>/(import\|export)` | siap (fase excel) |
   Endpoint baru **wajib didaftarkan** di sini; selain itu → `404 PATH_NOT_ALLOWED`.
4. **CSRF/Origin** — method mutating wajib Origin/Referer dengan origin sama persis dengan `SITE_PUBLIC_URL` → else `403 ORIGIN_REJECTED` (defense-in-depth di atas cookie SameSite).
5. **Body size pre-check** — `Content-Length > PROXY_MAX_BODY_MB` → `413` (batas final tetap di osc_rest).
6. **Header allowlist** — request yang diteruskan: `accept`, `accept-language`, `content-type` (boundary multipart terjaga). `cookie`, `host`, `x-forwarded-*`, `origin` **tidak pernah** diteruskan. Response yang diteruskan: `content-type`, `content-disposition`, `content-length`, `cache-control`; `set-cookie` upstream **dibuang** (token tidak boleh bocor ke browser).
7. **Auth** — `sessionTokenFromCookie()` membaca cookie `osc_session` (HttpOnly) dan menyuntik `Authorization: Bearer <token>` server-to-server. Penetapan cookie dilakukan fase auth (login response → `Set-Cookie` HttpOnly/Secure/SameSite).
8. **Passthrough streaming dua arah** — `req.body` (ReadableStream) diteruskan tanpa buffering (`duplex: 'half'` untuk multipart upload); respons upstream mengalir langsung ke browser (binary Excel export) **tanpa `await response.arrayBuffer()`**.
9. **Timeout & kegagalan** — `AbortSignal.timeout(RUST_API_TIMEOUT_MS)`; kegagalan jaringan → `502 UPSTREAM_UNREACHABLE` tanpa membocorkan detail.
10. **Security headers** pada semua respons proxy: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.

Error envelope proxy konsisten dengan Rust API: `{"status":"error","error":{"code":"...","message":"..."}}`.

## 3. API Proxy (BFF) & Rust Upstream Mapping

| Next.js Proxy Route | Method | Upstream Rust Endpoint | Auth / Cookie Handling | Payload / Stream Type |
| :--- | :--- | :--- | :--- | :--- |
| `/api/proxy/v1/health` | `GET` | `/api/v1/health` | tanpa token (public) | JSON |
| `/api/proxy/v1/auth/login` | `POST` | `/api/v1/auth/login` | tanpa token → fase auth menyetel cookie | JSON |
| `/api/proxy/v1/auth/refresh` \| `logout` | `POST` | `/api/v1/auth/*` | cookie sesi (rotasi/invalidasi — fase auth) | JSON |
| `/api/proxy/v1/users/...` | `GET/POST/PUT/PATCH` | `/api/v1/users/...` | cookie → `Bearer JWT` | JSON |
| `/api/proxy/v1/excel/<domain>/import` | `POST` | `/api/v1/excel/<domain>/import` | cookie → `Bearer JWT` | `multipart/form-data` (passthrough stream) |
| `/api/proxy/v1/excel/<domain>/export` | `GET` | `/api/v1/excel/<domain>/export` | cookie → `Bearer JWT` | `.xlsx` binary stream |

## 4. UI & Environment

- **shadcn/ui**: token theme (neutral, oklch) di `app/globals.css` (Tailwind v4 `@theme inline`), `components/ui/button.tsx` (cva) sebagai primitif pertama; komponen lanjutan ditambahkan via `npx shadcn@latest add ...` (alias sudah dikonfigurasi ke layer presentation).
- **Health page**: `/api/health` liveness osc_site (target healthcheck compose; tidak menggantung pada backend).
- **Env (`.env.example`)**: `RUST_API_INTERNAL_URL` (default `http://osc_rest:8000`), `SITE_PUBLIC_URL` (pembanding CSRF), `PROXY_MAX_BODY_MB=25`, `RUST_API_TIMEOUT_MS=30000`. Semua server-side; `appConfig` (`infrastructure/config.ts`) memvalidasi scheme http(s) & rentang nilai.

## 5. Security Controls & Threat Mitigation

- **SSRF / open-proxy**: base URL = konfigurasi tetap (bukan input); path default-deny + normalisasi traversal; tidak ada header `x-forwarded-*`/`host` dari klien yang diteruskan.
- **Token leakage**: JWT hanya di cookie HttpOnly/Secure/SameSite; `set-cookie` upstream dibuang; tidak ada `NEXT_PUBLIC_*` sensitif.
- **CSRF**: Origin/Referer check pada semua method mutating proxy (SameSite cookie sebagai lapisan utama).
- **XSS**: React escaping default; `dangerouslySetInnerHTML` dilarang tanpa sanitasi; CSP global di `next.config.ts` (`frame-ancestors 'none'`, dsb.).
- **CSP**: bootstrap memakai `'unsafe-inline'` untuk script/style Next.js — **nonce-based CSP** menyusul bersama middleware auth (TODO fase berikutnya).
- **Zod**: response schema divalidasi di gateway (`apiHealthSchema`); payload Server Action/form menyusul di fase fitur.

## 6. Testing & Verification Steps

- **Unit (fase berikutnya)**: `proxy-policy` (normalisasi/whitelist/origin) dan `session` — murni fungsi, mudah diuji vitest/jest.
- **Integrasi**: skenario proxy — path tak terdaftar → 404; method alien → 405; origin asing pada POST → 403; stream multipart/end-to-end setelah backend fitur hidup.
- **Verifikasi manual hari ini**:

```bash
cd osc_site
npm install
npx tsc --noEmit      # lulus (0 error)
npm run build         # lulus; route /api/proxy/[...path] = dynamic
# jalankan stack: docker compose up -d (root) lalu uji:
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/proxy/v1/health            # 200/503 dari osc_rest
curl -i http://localhost:3000/api/proxy/v1/not-allowed       # 404 PATH_NOT_ALLOWED
curl -i -X DELETE http://localhost:3000/api/proxy/v1/users/1 # 403 ORIGIN_REJECTED (tanpa Origin)
```
