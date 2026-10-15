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
- Indeks `parent_id` untuk penelusuran rantai leluhur/turunan.
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
- Relasi: `companies`, `areas`, `actions`, `tokens`, `sessions`,
  `approval_signs`, `signature_flags`.

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
- Relasi `user` ke `app_user` (`onDelete: Cascade`) — sesi ikut terhapus bila
  user dihapus; indeks `user_id`, `session_token`, `status`.

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

### 2.12 `app_signature_type` — Jenis Tanda Tangan

- `code` unik; induk dari `steps` (alur) dan `forms` (dokumen/form yang diproses).

### 2.13 `app_approval_step` — Langkah Persetujuan per Jenis

- `@@unique([type_id, step])` — urutan `step` unik per `app_signature_type`.
- `condition` default `ANY_APPROVED` (aturan untuk lolos langkah).
- `onDelete: Cascade` dari `app_signature_type`.

### 2.14 `app_approval_sign` — Penanda Antrean Persetujuan (Signer per Step)

- `@@unique([step_id, user_id])` — satu user hanya satu baris per step.
- Indeks `user_id` (pencarian balik berdasarkan user).
- `onDelete: Cascade` dari `app_approval_step`.

### 2.15 `app_signature_form` — Pengajuan Tanda Tangan (Form)

- `@@unique([request_id, step])` — satu form hanya satu baris per step.
- `status` default `PENDING`; `condition` default `ANY_APPROVED`.
- Indeks `signature_type_id`; relasi opsional ke `app_signature_type`.

### 2.16 `app_signature_flag` — Tanda/Sikap Signer dalam Form

- `@@unique([form_id, user_id])`; `status` default `PENDING`.
- Indeks `user_id` (pencarian balik berdasarkan user).
- `comment` opsional; `onDelete: Cascade` dari `app_signature_form`.

### 2.17 Admin Lanjutan `APP06`–`APP11`

Model baru (tetap prefix `app_*`) untuk Fase 6 — lihat
[../planning/app_sys.md](../planning/app_sys.md). **Sudah dibangun**:

| Kode | Model | Isi pokok |
|---|---|---|
| `APP06` | `app_notify_channel`, `app_notify_template`, `app_notify_rule`, `app_notify_message` | Notifikasi terpusat (kanal/template/aturan + log kirim). |
| `APP07` | `app_integration`, `app_integration_sync`, `app_employee` | Integrasi HRIS/SSO + riwayat sync + data karyawan. |
| `APP08` | `app_api_key`, `app_webhook`, `app_webhook_delivery` | Kunci API (hash + scope) + webhook keluar + log pengiriman. |
| `APP09` | `app_report` (+ `app_user_action`) | Report tersimpan; audit memakai `app_user_action`. |
| `APP10` | `app_preference`, `app_company_setting` | Preferensi user & setting per-company. |
| `APP11` | `app_backup`, `app_backup_item` | Backup konfigurasi/metadata + item. |
| `ANN` | `app_announcement`, `app_announcement_read` | Pengumuman/news internal + pelacakan baca (lihat [../planning/app_collab.md](../planning/app_collab.md)). |

## 3. Relasi Inti

```text
app_signature_type (1) ──► (N) app_approval_step ──► (N) app_approval_sign ──► app_user
      └──► app_signature_form ──► app_signature_flag ──► app_user
```

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

- Prefix: `app_`; model menyimpan `created_at`/`updated_at`
  (tanpa `created_by`/`updated_by`).
- Cookie sesi frontend `OmniSightMemory` menyimpan token dari tabel ini;
  backend membaca token via `app_user_token` di middleware `USLoad/USAuth`.
- Cluster baru jangan memakai prefix `app_` (ganti `net_`, `obs_`, dst.) — lihat
  [README.md](README.md).