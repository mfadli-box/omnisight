# Planning Modul `SYS` — Session Profile (SYS01–SYS03)

> Bagian dari [Planning](../README.md) · Daftar modul: [README](README.md) ·
> Status: **Selesai**

## 1. Ringkasan

Self-service user yang sedang login: melihat **profil**, **mengubah password**,
dan melihat **riwayat** sesi/login. Berbeda dari modul `APP` yang admin-only,
`SYS` dapat diakses user biasa untuk dirinya sendiri.

## 2. Model Database

| Model | Peran |
|---|---|
| `app_user` | Sumber profil; verifikasi & pergantian password. |
| `app_user_token` | Sumber riwayat login/sesi terbit (`token_type`, IP, UA, revoked). |
| `app_user_company` | Daftar company milik user pada profil. |

## 3. Backend

- **Paket:** `osc_rest/skeleton/sys/`.
- **Grup route:** `auths` (`USAuth()`).

### Endpoint

| Method | Path | Handler | Keterangan |
|---|---|---|---|
| GET | `/rest/pages/SYS01/profile` | `sys.SYS01Profile` | Profil user + daftar company. |
| PUT | `/rest/pages/SYS02/password` | `sys.SYS02Password` | Ganti password (`old_password`, `new_password`). |
| GET | `/rest/pages/SYS03/history` | `sys.SYS03History` | Riwayat sesi/login user. |

## 4. Frontend

- **Halaman:** `osc_site/src/app/board/pages/SYS/`
  - `SYS01/` — `components/profile-card.tsx`
  - `SYS02/` — `components/password-form.tsx`
  - `SYS03/` — `components/history-table.tsx`

## 5. Otorisasi & Privilege

- Cukup login (`USAuth`); hanya mengakses data milik user yang login.
- Tidak memerlukan `USLock` (bukan admin-only).

## 6. Checklist

- [x] DB — `app_user` (+ company).
- [x] Backend — `SYS01Profile`, `SYS02Password`, `SYS03History`.
- [x] Frontend — profile-card, ubah password, riwayat.
- [x] Docs — backend/frontend.
- [x] Test — `test_backend_api.py` (profil/password/history).

## 7. Catatan / TODO

- [ ] Kebijakan kekuatan password & riwayat password.
- [ ] Sesi perangkat aktif + tombol "cabut sesi lain".
- [ ] Tampilkan status 2FA bila diaktifkan.
