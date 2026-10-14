# Planning Modul `PUB00` — Login / Auth (Guest)

> Bagian dari [Planning](../README.md) · Daftar modul: [README](README.md) ·
> Status: **Selesai**

## 1. Ringkasan

Halaman login publik. Menyediakan daftar company untuk dropdown, memverifikasi
kredensial, menerbitkan token akses, dan mencatat percobaan login. Modul ini satu
paket dengan `APP00` (navigation shell).

## 2. Model Database

| Model | Peran |
|---|---|
| `app_company` | Sumber dropdown company pada halaman login (`is_active`). |
| `app_user` | Verifikasi kredensial; `failed_attempts`, `locked_until`. |
| `app_user_token` | Menyimpan token terbit (`token_type`, masa berlaku). |

> Catatan: login hanya menulis `app_user_token`; `app_user_session` tidak
> ditulis saat login (walaupun kini memiliki FK ke `app_user`).

## 3. Backend

- **Paket:** `osc_rest/skeleton/pub/` (`pub00_handler.go`, `pub00_usecase.go`,
  `pub00_repository.go`, `pub00_template.go`).
- **Grup route:** `guest` (`/rest/guest`).

### Endpoint

| Method | Path | Handler | Keterangan |
|---|---|---|---|
| GET | `/rest/guest/PUB00` | `pub.PUB00Company` | Daftar company untuk dropdown. |
| POST | `/rest/guest/PUB00` | `pub.PUB00Login` | Login → token + profil. |

### Aturan login (`pub00_template.go`)

- Maksimum **5** percobaan gagal → akun dikunci **15 menit**.
- TTL token akses **24 jam**, `token_type = JWT`.
- Respons sukses: `token`, `expires_at`, `user_profile`.

## 4. Frontend

- **Halaman:** `osc_site/src/app/login/`.
- Menampilkan pilihan company + form username/password.
- Menyimpan token dan mengarahkan ke board setelah sukses.

## 5. Otorisasi & Privilege

- Route **publik** (tanpa `USAuth`), sengaja di grup `guest`.
- Rate/limit dikendalikan melalui `failed_attempts` & `locked_until` di DB.

## 6. Checklist

- [x] DB — `app_company`, `app_user`, `app_user_token`.
- [x] Backend — `PUB00Company`, `PUB00Login`.
- [x] Frontend — halaman `/login`.
- [x] Docs — backend/frontend.
- [x] Test — `osc_docs/testing/test_backend_api.py` (login).

## 7. Catatan / TODO

- [ ] Opsional: SSO/OIDC.
- [ ] Opsional: penguncian berbasis IP selain per-akun.
- [ ] Pertimbangkan menulis `app_user_session` saat login (butuh relasi/FK).
