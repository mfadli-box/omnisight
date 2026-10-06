# Osc_site — Frontend (Teknis)

> Frontend Next.js (App Router) untuk OmniSight: dashboard multi-tenant dengan
> sidebar dinamis, tema, proxy API, dan kumpulan komponen UI.

## 1. Stack

| Item | Nilai |
|---|---|
| Framework | Next.js (App Router, `output: standalone`) |
| UI Library | `@base-ui/react`, `@shadcn/react`, UI kit lokal di `src/uix/` |
| Styling | Tailwind CSS v4 + `tw-animate-css` |
| Forms | `react-hook-form` + `zod` |
| State | `zustand` (preferences/theme) |
| Charts | `recharts` |
| Editor/Terminal | `@uiw/react-codemirror`, `@xterm/xterm` |
| Export | `jspdf`, `docx`, `html2canvas` |
| Port dev/start | `37773` (`npm run dev` / `npm run start`; lihat `package.json`) |
| Port docker | `37773` (standalone; env `PORT`, lihat `Dockerfile`) |

## 2. Struktur

```
osc_site/
├── src/
│   ├── app/                  # App Router
│   │   ├── layout.tsx        # root layout (+ theme provider)
│   │   ├── page.tsx          # landing
│   │   ├── login/            # login page + captcha + pilih company
│   │   ├── board/            # dashboard terautentikasi
│   │   │   ├── layout.tsx    # sidebar provider, breadcrumb, error boundary
│   │   │   ├── model/        # modul navigasi dinamis (dari /APP00/module)
│   │   │   ├── widget/       # sidebar, nav, breadcrumb, company, dashboard, error
│   │   │   ├── pages/        # halaman modul terpasang
│   │   │   │   └── SYS/   # halaman session-profile
│   │   │   │       ├── SYS01/    # profil (profile-card)
│   │   │   │       ├── SYS02/    # ganti password (password-form)
│   │   │   │       └── SYS03/    # riwayat login (history-table)
│   │   │   └── [...not-found]/
│   │   ├── proxy/            # server proxy → backend
│   │   │   ├── guest/.../    # → /rest/guest/*
│   │   │   └── pages/.../    # → /rest/pages/* (auth + company)
│   │   ├── files/.../        # sajian file statis dari BE (readonly)
│   │   └── theme/            # tema (mode, preset), fonts, layouts
│   ├── lib/                  # util, backend config, client-api, session, ws, grid
│   └── uix/                  # komponen UI reusable (+ datatable, badge, dsb.)
├── proxy.ts                  # middleware next (guard route /board via cookie)
├── next.config.ts            # output standalone (+ allowedDevOrigins)
└── Dockerfile                # multi-stage node 24 → runner (port 37773)
```

## 3. Koneksi ke Backend

Konfigurasi disatukan di `src/lib/backend.ts`:

```ts
export const BE_POOL = process.env.BE_POOL ?? "http://osc_rest:37775";
export const WS_POOL  = ...;   // dari NEXT_PUBLIC_WS_POOL / BE_POOL (http→ws)
```

Dua jalur akses (client-side & server-side):

### a. Client API (`src/lib/client-api.ts`)

`clientApi<T>(path, {method, body, params})` — otomatis:
- menambahkan `Authorization: Bearer <token>` dari cookie `OmniSightMemory`;
- menambahkan `X-Company-ID` dari `localStorage["OmniSightCompany"]`;
- route lewat `/proxy/pages` agar secret/token tidak bocor ke browser;
- pada 401: hapus sesi & redirect `/login`.

### b. Server proxy (App Router)

- `app/proxy/guest/[...path]/route.ts` → meneruskan ke `${BE_POOL}/rest/guest/*`.
- `app/proxy/pages/[...path]/route.ts` → meneruskan ke `${BE_POOL}/rest/pages/*`
  dengan menyuntik `Authorization` dari cookie (token tidak terlihat client).

Semua proxy meneruskan `X-Request-ID` dan format error backend.

## 4. Autentikasi & Sesi

- Login (`app/login/`): form react-hook-form + zod; captcha 3-digit numerik;
  pilih company (opsional, dari `/rest/guest/PUB00`).
- Session disimpan sebagai `SessionData` (token, expires_at, user_profile) di:
  - `localStorage["OmniSightMemory"]` (akses client hook), dan
  - cookie `OmniSightMemory` (akses middleware & server proxy).
- Alat bantu: `src/lib/utility.ts` (`persistSession`, `parseSession`,
  `isSessionExpired`, `forceLogout`), `src/lib/use-session.ts` (`useSessionSnapshot`).
- Guard: `proxy.ts` middleware memblokir `/board/*` tanpa sesi valid.
- Logout: `DELETE /proxy/pages/APP00` + hapus sesi lokal.

## 5. Navigasi & Modul

`src/app/board/model/module.ts`:
- Mengambil pohon modul dari `GET /proxy/pages/APP00/module?company_id=...`;
- memetakan kode modul (`APP`, `AMM`, `BOT`, `DOC`, `JMS`, `NET`, `OBS`, `POD`,
  `SYS`, `VMS`, `WAF`, `WEB`) → ikon `lucide-react`;
- `is_page` → link; non-page → grup dengan submenu;
- menu statis: admin mendapat group `Application` (APP01–11), user login mendapat
  `Session Profile` (SYS01–SYS03); modul dinamis ditambahkan di atasnya.

Komponen sidebar (`src/app/board/widget/`):
- `sidebar.tsx` — `AppSidebar`: avatar, menu, company, logout.
- `company.tsx` — `CompanyCombobox`: `GET /proxy/pages/APP00/company`; primary
  company dikunci dari `user_profile.company_id`, lainnya bisa dipilih.
- `module.tsx` — `NavMain`: render `NavGroup[]` (link/parent/collapsible).
- `dashboard.tsx` — `Board`: validasi sesi via `/APP00/company`, tampilan profil.
- `breadcrumb.tsx`, `error-boundary.tsx` — breadcrumb & error boundary.

Logout: `DELETE /proxy/pages/APP00` (revoke token) + hapus sesi lokal.

## 6. Tema

`src/app/theme/`:
- `model.ts`: mode (light/dark/system) + preset warna.
- `stores.ts`: zustand store tersinkron (mis. preferensi sidebar).
- `utilities.ts`: helper CSS var (oklch), dsb.
- `theme.tsx`: provider tema + mode.

Komponen di `src/uix/` (sidebar, button, dialog, dsb.) mengikuti pola
`@shadcn`/Base UI dan memakai `cn()` dari `src/lib/utility.ts`.

## 7. WebSocket & Terminal (client)

`src/lib/ws.ts`:
- `useSocket({url, ...})` — hook WebSocket dengan reconnect, heartbeat `ping`,
  `send`/`sendJson`, dan auto-cleanup saat unmount.
- `useTerminalSocket(...)` — wrapper untuk terminal (SSH/docker) ke backend
  (mis. innerop dengan `mechanic.sshproxy` milik `osc_rest`).

Arah koneksi WebSocket dibangkitkan dari `WS_POOL` (`ws://` dari `BE_POOL`).

## 8. Environment (`.env`, `NEXT_PUBLIC_*`)

| Variabel | Peran |
|---|---|
| `BE_POOL` | Base URL backend (default container `osc_rest:37772`, local `http://localhost:37772`) |
| `NEXT_PUBLIC_WS_POOL` | Base WebSocket (jika berbeda dari BE_POOL) |
| `WS_NAME`,`WS_CONF`,`WS_DESC` | Nama & branding (muncul di sidebar/meta) |
| `TZ` | Timezone (Asia/Jakarta) |

Hanya `NEXT_PUBLIC_*` yang diekspos ke browser; sisanya disuntik server-side.

## 9. Skrip & Perintah

```bash
cd osc_site
npm run dev      # next dev -p 37773
npm run build    # next build (standalone)
npm run start    # next start -p 37773
npm run lint     # eslint
```

Docker (lihat `Dockerfile`): build `standalone`, port dalam container `37773`,
env contoh `BE_POOL=http://osc_rest:37772`,
`NEXT_PUBLIC_WS_POOL=ws://osc_rest:37772`.

> Catatan: `docker-compose.yml` belum mendefinisikan service `osc_site`;
> jalankan image via `docker run -p 37773:37773` sementara.

## 10. Referensi

- Backend API & error format: [backend/README.md](../backend/README.md)
- Konvensi API (auth, header): [development/conventions.md](../development/conventions.md)
- Menjalankan dia: [development/run.md](../development/run.md)