# Planning Modul `APP03` — User & Privilege

> Bagian dari [Planning](../README.md) · Daftar modul: [README](README.md) ·
> Status: **Selesai**

## 1. Ringkasan

Pengelolaan **user**, keanggotaan user pada company (**privilege per modul**),
dan pemetaan user ke area. Inti dari sistem otorisasi OmniSight.

## 2. Model Database

| Model | Peran |
|---|---|
| `app_user` | Master user: `username` (unik per company), `email`, `password`, `fullname`, `role`, `is_admin`, `is_hris`, `is_active`, `is_totp_enabled`, `locked_until`, `failed_attempts`. |
| `app_user_company` | Keanggotaan user pada company (`is_active`). |
| `app_user_privilege` | Level akses per modul: `HIDE/VIEW/BOOK/POST` (default `HIDE`). |
| `app_user_area` | Pemetaan user ke area (`company_area_id`). |

## 3. Backend

- **Paket:** `osc_rest/skeleton/app/app03/`.
- **Grup route:** `admin` (`USAuth()`, `USLock()`, `USLogs("")`).

### Endpoint

| Method | Path |
|---|---|
| GET/POST | `/rest/pages/APP03/users` |
| GET/PUT/DELETE | `/rest/pages/APP03/users/:id` |
| GET/POST | `/rest/pages/APP03/users/:id/companies` |
| PUT/DELETE | `/rest/pages/APP03/users/:id/companies/:uid` |
| GET/POST | `/rest/pages/APP03/users/:id/companies/:uid/privileges` |
| PUT/DELETE | `/rest/pages/APP03/users/:id/companies/:uid/privileges/:pid` |
| GET/POST | `/rest/pages/APP03/users/:id/areas` |
| PUT/DELETE | `/rest/pages/APP03/users/:id/areas/:uid` |

### Integrasi lintas-modul

- **`applink`** — saat user ditambahkan ke company, otomatis dibuat
  `app_user_company` dan privilege default per modul (`HIDE`).

## 4. Frontend

- **Halaman:** `osc_site/src/app/board/pages/APP/APP03/`.
- **Komponen:** `user-table.tsx`, `user-form.tsx`, `companies-tab.tsx`,
  `privileges-tab.tsx`, `areas-tab.tsx`.

## 5. Otorisasi & Privilege

- Admin only. Level privilege yang diatur di sini dipakai `USRole` untuk
  membuka endpoint modul lain (mis. `USRole("AMM","POST")`).

## 6. Checklist

- [x] DB — `app_user`, `app_user_company`, `app_user_privilege`, `app_user_area`.
- [x] Backend — CRUD user + companies + privileges + areas.
- [x] Frontend — `user-table`, `user-form`, `companies-tab`, `privileges-tab`,
      `areas-tab`.
- [x] Docs — backend/frontend/database.
- [x] Test — cakupan user/privilege.

## 7. Catatan / TODO

- [ ] Hashing password terverifikasi (bcrypt/argon) untuk create/update user.
- [ ] 2FA/TOTP (`is_totp_enabled`, `totp_secret`) belum ada alur aktivasi.
- [ ] Kebijakan password minimum & reset paksa.
