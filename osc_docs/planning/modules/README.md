# Planning Per Modul — Modul yang Sudah Ada

> Dokumen perencanaan **per modul** untuk modul yang sudah dibangun.
> Ringkasan arsitektur & roadmap ada di [../blueprint.md](../blueprint.md),
> [../roadmap.md](../roadmap.md), dan status keseluruhan di
> [../checklist.md](../checklist.md).

## Daftar Modul

| Kode | Modul | Dokumen | Status |
|---|---|---|---|
| `PUB00` | Login / Auth (guest) | [pub00.md](pub00.md) | Selesai |
| `APP00` | Navigation shell (company/module/logout) | [app00.md](app00.md) | Selesai |
| `APP01` | Module | [app01.md](app01.md) | Selesai |
| `APP02` | Company | [app02.md](app02.md) | Selesai |
| `APP03` | User & Privilege | [app03.md](app03.md) | Selesai |
| `APP04` | Signature / Approval | [app04.md](app04.md) | Selesai |
| `APP05` | Session / Token / Action | [app05.md](app05.md) | Selesai |
| `SYS` | Session Profile (SYS01–SYS03) | [sys.md](sys.md) | Selesai |

## Konvensi Umum (berlaku semua modul)

- **Lokasi backend:** `osc_rest/skeleton/<paket>/` (handler, usecase, repository,
  template) + registrasi route di `osc_rest/backbone/routes.go`.
- **Lokasi frontend:** `osc_site/src/app/board/pages/<APP|SYS>/<KODE>/`
  (`page.tsx`, `api.ts`, `schemas.ts`, `components/`).
- **Otorisasi:** grup route `admin` (`USAuth()`, `USLock()`, `USLogs("")`) untuk
  CRUD admin; grup `auths` (`USAuth()`) untuk self-service; grup `guest` untuk
  login. `USRole(<kode>, <level>)` untuk cek privilege per-modul.
- **Grid & fetch:** respons grid backend memakai kunci `Rows`; frontend memakai
  helper `@/lib/grid`.
- **Audit:** mutasi admin dicatat otomatis ke `app_user_action` via `USLogs`
  (module diturunkan dari path bila kosong).
- **Pola form:** remount via `key` (hindari `setState` di `useEffect`).
