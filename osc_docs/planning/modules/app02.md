# Planning Modul `APP02` — Company

> Bagian dari [Planning](../README.md) · Daftar modul: [README](README.md) ·
> Status: **Selesai**

## 1. Ringkasan

Pengelolaan **company** (entitas/organisasi), pemetaan modul yang aktif per
company, serta daftar **area** di dalam company.

## 2. Model Database

| Model | Peran |
|---|---|
| `app_company` | Master company: `code` (unik), `name`, `valuta`, `vat_id`, `reg_no`, `address`, `tax_office`, `hris_link`, `is_active`. |
| `app_company_module` | Modul yang diaktifkan untuk company (`is_active`). |
| `app_company_area` | Area dalam company (`code`, `name`, `description`, `is_active`). |

## 3. Backend

- **Paket:** `osc_rest/skeleton/app/app02/`.
- **Grup route:** `admin` (`USAuth()`, `USLock()`, `USLogs("")`).

### Endpoint

| Method | Path |
|---|---|
| GET/POST | `/rest/pages/APP02/companies` |
| GET/PUT/DELETE | `/rest/pages/APP02/companies/:id` |
| GET/POST | `/rest/pages/APP02/companies/:id/modules` |
| PUT/DELETE | `/rest/pages/APP02/companies/:id/modules/:uid` |
| GET/POST | `/rest/pages/APP02/companies/:id/areas` |
| PUT/DELETE | `/rest/pages/APP02/companies/:id/areas/:uid` |

## 4. Frontend

- **Halaman:** `osc_site/src/app/board/pages/APP/APP02/`.
- **Komponen:** `company-table.tsx`, `company-form.tsx`, `modules-tab.tsx`,
  `areas-tab.tsx`.
- Form company memakai pola **remount via `key`**.

## 5. Otorisasi & Privilege

- Admin only. Company adalah konteks utama otorisasi: `USAuth` + header/konteks
  company menentukan privilege yang berlaku.

## 6. Checklist

- [x] DB — `app_company`, `app_company_module`, `app_company_area`.
- [x] Backend — CRUD company + modules + areas.
- [x] Frontend — `company-table`, `company-form`, `modules-tab`, `areas-tab`.
- [x] Docs — backend/frontend/database.
- [x] Test — cakupan perusahaan/auth.

## 7. Catatan / TODO

- [ ] Seed company default + aktivasi modul dasar.
- [ ] Guard hapus company yang masih punya user/area aktif.
