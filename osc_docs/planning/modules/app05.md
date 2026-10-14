# Planning Modul `APP05` — Session / Token / Action

> Bagian dari [Planning](../README.md) · Daftar modul: [README](README.md) ·
> Status: **Selesai**

## 1. Ringkasan

Pengelolaan **sesi**, **token akses**, dan **audit tindakan** (action) user.
Sesi & token bersifat CRUD; action bersifat **read-only** (audit).

## 2. Model Database

| Model | Peran |
|---|---|
| `app_user_session` | Sesi user: `session_token`, `ip_address`, `user_agent`, `status`, `started_at`, `last_active`, `ended_at`. FK `user_id` → `app_user` (`onDelete: Cascade`). |
| `app_user_token` | Token: `token_type`, `token`, `refresh_token`, masa berlaku, `is_blocked`, `revoked_at` (FK `app_user`, `onDelete: Cascade`). |
| `app_user_action` | Audit: `user_id`, `company_id`, `module_code`, `action`, `path`, `ip_address`, `user_agent` (FK `app_user`, cascade). |

## 3. Backend

- **Paket:** `osc_rest/skeleton/app/app05/`.
- **Grup route:** `admin` (`USAuth()`, `USLock()`, `USLogs("")`).

### Endpoint

| Method | Path | Keterangan |
|---|---|---|
| GET/POST | `/rest/pages/APP05/sessions` | List/Create sesi. |
| GET/PUT/DELETE | `/rest/pages/APP05/sessions/:id` | Detail/Update/Hapus sesi. |
| GET/POST | `/rest/pages/APP05/tokens` | List/Create token. |
| GET/PUT/DELETE | `/rest/pages/APP05/tokens/:id` | Detail/Update/Hapus token. |
| GET | `/rest/pages/APP05/actions` | **Read-only** daftar audit. |
| GET | `/rest/pages/APP05/actions/:id` | **Read-only** detail audit. |

### Audit (`USLogs`)

- `backbone/memory.go` — `USLogs` menulis ke `app_user_action`; **module
  diturunkan dari segmen path** bila `moduleCode` kosong.
- `backbone/routes.go` — grup `admin.Use(USAuth(), USLock(), USLogs(""))`.
- Pencarian audit: username/fullname, module_code, action, path, ip.

## 4. Frontend

- **Halaman:** `osc_site/src/app/board/pages/APP/APP05/`.
- **Komponen:** `sessions-table.tsx`, `session-form.tsx`, `tokens-table.tsx`,
  `token-form.tsx`, `actions-table.tsx` (read-only, `hideSelect`).
- Tab halaman: **Session / Token / Action**.

## 5. Otorisasi & Privilege

- Admin only untuk CRUD sesi/token.
- Action bersifat audit; tidak ada operasi tulis dari UI.

## 6. Checklist

- [x] DB — `app_user_session`, `app_user_token`, `app_user_action`.
- [x] Backend — CRUD sessions + tokens, list/get actions.
- [x] Frontend — `sessions-table/form`, `tokens-table/form`, `actions-table`.
- [x] Docs — backend/frontend.
- [x] Test — `e2e_app05.py` (sesi & token) + audit via `USLogs`.

## 7. Catatan / TODO

- [ ] Job pembersihan token/sesi kedaluwarsa (retensi).
- [ ] Export audit (CSV/Excel) & filter rentang tanggal di UI.
- [x] `app_user_session` diberi relasi/FK ke `app_user` (`onDelete: Cascade`) —
      migrasi `20261009022856_complete_cluster_app`.
