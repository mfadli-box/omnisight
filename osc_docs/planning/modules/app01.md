# Planning Modul `APP01` — Module

> Bagian dari [Planning](../README.md) · Daftar modul: [README](README.md) ·
> Status: **Selesai**

## 1. Ringkasan

Pengelolaan master **modul** aplikasi (menu/halaman), termasuk hierarki
parent–child. Modul adalah sumber pohon sidebar dan rujukan privilege user.

## 2. Model Database

| Model | Peran |
|---|---|
| `app_module` | Master modul: `parent_id` (self-relation), `code` (unik), `name`, `path`, `is_page`, `is_active`. |
| `app_company_module` | Fan-out `applink`: setiap modul baru dipetakan ke company. |

## 3. Backend

- **Paket:** `osc_rest/skeleton/app/app01/`.
- **Grup route:** `admin` (`USAuth()`, `USLock()`, `USLogs("")`).

### Endpoint

| Method | Path | Handler |
|---|---|---|
| GET | `/rest/pages/APP01/modules` | `APP01ModulesList` |
| POST | `/rest/pages/APP01/modules` | `APP01ModulesCreate` |
| GET | `/rest/pages/APP01/modules/:id` | `APP01ModulesGet` |
| PUT | `/rest/pages/APP01/modules/:id` | `APP01ModulesUpdate` |
| DELETE | `/rest/pages/APP01/modules/:id` | `APP01ModulesDelete` |

### Integrasi lintas-modul

- **`applink`** — saat modul dibuat, otomatis menyisipkan `app_company_module`.
  Saat modul dihapus, relasi terkait ikut dibersihkan (cascade).

## 4. Frontend

- **Halaman:** `osc_site/src/app/board/pages/APP/APP01/`
  (`page.tsx`, `api.ts`, `schemas.ts`).
- **Komponen:** `components/module-table.tsx`, `components/module-form.tsx`.
- Form memakai pola **remount via `key`** (`formKey`) agar tidak memicu lint
  `react-hooks/set-state-in-effect`.

## 5. Otorisasi & Privilege

- Admin only (`USLock`). Mutasi tercatat ke `app_user_action` (`USLogs`).
- `code` dipakai `USRole` pada modul lain sebagai kunci privilege.

## 6. Checklist

- [x] DB — `app_module` (hierarki `parent_id`).
- [x] Backend — CRUD `/APP01/modules` + fan-out `applink`.
- [x] Frontend — `module-table` + `module-form`.
- [x] Docs — backend/frontend/database.
- [x] Test — `test_backend_api.py` (module list).

## 7. Catatan / TODO

- [ ] Validasi siklus parent (`parent_id` tidak boleh menunjuk keturunannya).
- [ ] Guard hapus modul yang masih dipakai privilege (atau cascade eksplisit).
- [ ] Kolom urutan tampil pada sidebar.
