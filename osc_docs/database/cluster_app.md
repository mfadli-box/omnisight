# Osc_base — `prisma/schema/cluster_app.prisma`

> Dokumen detail cluster **App** — model multi-tenant aplikasi (`app_*`).
> 🔗 Kembali ke [database/README.md](README.md).

## 1. Ringkasan

Cluster App mengimplementasikan **multi-tenancy berbasis company**: satu
database melayani banyak perusahaan, pemisahan data via relasi `company_id`,
kontrol akses berbasis modul/area, sesi/token aman, dan audit trail.

## 2. Model

### 2.1 `app_module` — Pohon Menu/Modul

- `code` unik; `path` lokasi menu; `is_page` membedakan halaman vs folder.
- Relasi self `modular` (parent–children) untuk hierarki menu bertingkat.
- Dipakai frontend untuk membangun sidebar & otorisasi menu (`APP00/module`).

### 2.2 `app_company` — Perusahaan

- `code` unik; `valuta` default `IDR`; `is_active` default `false` (perlu aktivasi).
- Data identitas: `vat_id`, `reg_no`, `tax_office`, `address`, `hris_link`.
- Memiliki `modules` (pivot), `areas`, `users`.

### 2.3 `app_company_module` — Pivot Company ⇄ Module

- `@@unique([company_id, module_id])` — satu company hanya punya satu baris per
  modul; `is_active` menentukan modul yang diaktifkan.

### 2.4 `app_company_area` — Area/Lokasi Perusahaan

- `@@unique([company_id, code])`; dibatasi scope data user (`app_user_area`).
- Indeks `company_id` untuk lookup cepat.

### 2.5 `app_user` — Akun User

- `@@unique([company_id, username])` — username unik per company.
- Keamanan: `password` (bcrypt), `is_totp_enabled`, `totp_secret`,
  `locked_until`, `failed_attempts` (lockout brute-force).
- Flag: `is_admin`, `is_hris`, `is_active`.
- Relasi: `companies`, `areas`, `actions`, `tokens`.

### 2.6 `app_user_company` — Pivot User ⇄ Company

- `@@unique([user_id, company_id])`; `is_active` menentukan relasi aktif.
- Menjadi induk bagi `app_user_privilege`.

### 2.7 `app_user_area` — Pivot User ⇄ Area

- `@@unique([user_id, company_area_id])` — membatasi akses user ke area tertentu.

### 2.8 `app_user_privilege` — Level Akses (User-Company, Module)

- `@@unique([user_company_id, module_id])`; `level` default `HIDE`.
- Level: `HIDE`, `VIEW`, `BOOK`, `POST` (dibaca middleware `USRole`).
- Admin di-bypass (tidak wajib baris privilege).

### 2.9 `app_user_session` — Sesi Login

- `session_token` `VarChar(512)`, `ip_address`, `user_agent`,
  `started_at`, `last_active`, `ended_at`, `status`.
- Indeks: `user_id`, `session_token`, `status`.

### 2.10 `app_user_action` — Audit Trail

- Mencatat `module_code`, `action`, `path`, `ip_address`, `user_agent`.
- `onDelete: Cascade` dari `app_user`; indeks `user_id`, `company_id`.
- Dicatat middleware `USLogs(moduleCode)`.

### 2.11 `app_user_token` — Token Otentikasi

- `token` unik, refresh token unik (`refresh_token`), `token_type` default JWT.
- Lifecycle: `issued_at`, `access_expires_at`, `refresh_expires_at`,
  `last_activity_at`.
- Keamanan: `fingerprint`, `device_id`, `ip_address`, `is_blocked`,
  `blocked_reason`, `impersonated_by`, `revoked_at`, `revoked_reason`.
- Indeks: `user_id, revoked_at`, `token_type`, `refresh_expires_at`.
- `onDelete: Cascade` dari `app_user`.

## 3. Relasi Inti

```text
app_company (1) ──► (N) app_company_area
      │
      ├──► app_company_module ──► app_module (pohon)
      ├──► app_user_company ──► app_user_privilege (module, level)
      │         └──► app_user_area (scr→company_area)
      ▼
app_user ──► app_user_session · app_user_token · app_user_action (audit)
```

## 4. Aksi Keamanan yang Didukung

| Fitur | Model/Pola |
|---|---|
| Password hash | `app_user.password` (bcrypt, salt 10) |
| 2FA | `app_user.totp_secret`, `is_totp_enabled` |
| Lockout | `app_user.failed_attempts`, `locked_until` |
| Otorisasi menu | `app_user_privilege.level` (HIDE/VIEW/BOOK/POST) + `app_module` |
| Scope company/area | `app_user_company`, `app_user_area`, `app_company_area` |
| Sesu/token hidup | `app_user_session`, `app_user_token` (block/revoke) |
| Audit | `app_user_action` (module, path, IP, UA) |

## 5. Konvensi Tambahan

- Prefix: `app_`; seluruh model memiliki kolom audit default
  (`created_at/updated_at/created_by/updated_by`).
- Cookie sesi frontend `OmniSightMemory` menyimpan token dari tabel ini;
  backend membaca token via `app_user_token` di middleware `USLoad/USAuth`.
- Cluster baru jangan memakai prefix `app_` (ganti `net_`, `obs_`, dst.) — lihat
  [README.md](README.md).