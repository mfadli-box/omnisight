# Planning Modul `APP00` — Navigation Shell

> Bagian dari [Planning](../README.md) · Daftar modul: [README](README.md) ·
> Status: **Selesai**

## 1. Ringkasan

`APP00` **bukan halaman**, melainkan utilitas shell aplikasi: logout, daftar
company milik user, dan pohon modul untuk sidebar. Sidebar dibangun dinamis dari
`app_module` + privilege user.

## 2. Model Database

| Model | Peran |
|---|---|
| `app_module` | Sumber pohon menu (`parent_id`, `code`, `path`, `is_page`, `is_active`). |
| `app_user_privilege` | Level akses user per modul (`HIDE/VIEW/BOOK/POST`). |
| `app_user_company` | Company tempat user aktif. |
| `app_user_token` | Dihapus/dicabut saat logout. |

## 3. Backend

- **Paket:** `osc_rest/skeleton/app/app00/`.
- **Grup route:** `auths` (`USAuth()`).

### Endpoint

| Method | Path | Handler | Keterangan |
|---|---|---|---|
| DELETE | `/rest/pages/APP00` | `app00.APP00Logout` | Cabut token sesi aktif. |
| GET | `/rest/pages/APP00/company` | `app00.APP00Company` | Company yang boleh diakses user. |
| GET | `/rest/pages/APP00/module` | `app00.APP00Module` | Pohon modul/privilege untuk sidebar. |

### Aturan menu (`app00_repository.go`)

- Admin melihat seluruh modul aktif; non-admin hanya yang punya privilege.
- **Parent selalu tampil bila ada turunan non-`HIDE`** — dihitung dengan
  **recursive CTE** (`WITH RECURSIVE visible …`) yang menelusuri rantai leluhur
  via `parent_id`.

## 4. Frontend

- **Layout:** `osc_site/src/app/board/` (`model/`, `widget/`, `pages/`).
- Sidebar dinamis + `CompanyCombobox` (pilih company aktif).

## 5. Otorisasi & Privilege

- Butuh login (`USAuth`).
- Level privilege memengaruhi tampil/tidaknya modul di sidebar.

## 6. Checklist

- [x] DB — memakai `app_user`, `app_user_token`, `app_company`, `app_module`.
- [x] Backend — logout/company/module + recursive parent visibility.
- [x] Frontend — layout board, sidebar dinamis, `CompanyCombobox`.
- [x] Docs — backend/frontend.
- [x] Test — `test_backend_api.py` (company, module, profil).

## 7. Catatan / TODO

- [ ] Cache pohon menu per user/company bila jumlah modul bertambah besar.
- [ ] Dukung urutan/`sort` eksplisit pada `app_module` bila diperlukan.
