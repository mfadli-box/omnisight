# Planning Modul `APP04` — Signature / Approval

> Bagian dari [Planning](../README.md) · Daftar modul: [README](README.md) ·
> Status: **Selesai**

## 1. Ringkasan

Pengelolaan alur **tanda tangan / persetujuan** bertingkat: tipe tanda tangan,
langkah (step) persetujuan, penanda tangan (signer), formulir pengajuan, dan
flag persetujuan per user.

## 2. Model Database

| Model | Peran |
|---|---|
| `app_signature_type` | Tipe alur: `code` (unik), `name`. |
| `app_approval_step` | Langkah pada tipe: `step`, `condition` (default `ANY_APPROVED`). |
| `app_approval_sign` | Signer per step (`user_id`). |
| `app_signature_form` | Formulir pengajuan: `request_id`, `step`, `status`, `condition`. |
| `app_signature_flag` | Status persetujuan user pada form: `status`, `comment`. |

## 3. Backend

- **Paket:** `osc_rest/skeleton/app/app04/`.
- **Grup route:** `admin` (`USAuth()`, `USLock()`, `USLogs("")`).

### Endpoint

| Method | Path |
|---|---|
| GET/POST | `/rest/pages/APP04/types` |
| GET/PUT/DELETE | `/rest/pages/APP04/types/:id` |
| GET/POST | `/rest/pages/APP04/types/:id/steps` |
| GET/PUT/DELETE | `/rest/pages/APP04/types/:id/steps/:sid` |
| GET/POST | `/rest/pages/APP04/types/:id/steps/:sid/signers` |
| PUT/DELETE | `/rest/pages/APP04/types/:id/steps/:sid/signers/:uid` |
| GET/POST | `/rest/pages/APP04/forms` |
| GET/PUT/DELETE | `/rest/pages/APP04/forms/:id` |
| GET/POST | `/rest/pages/APP04/forms/:id/flags` |
| PUT/DELETE | `/rest/pages/APP04/forms/:id/flags/:uid` |

## 4. Frontend

- **Halaman:** `osc_site/src/app/board/pages/APP/APP04/`.
- **Komponen:** `types-table.tsx`, `types-form.tsx`, `steps-tab.tsx`,
  `signers-tab.tsx`, `forms-table.tsx`, `forms-form.tsx`, `flags-tab.tsx`.

## 5. Otorisasi & Privilege

- Admin only. Signer mengacu ke `app_user`.

## 6. Checklist

- [x] DB — `app_signature_type`, `app_approval_step`, `app_approval_sign`,
      `app_signature_form`, `app_signature_flag`.
- [x] Backend — CRUD types + steps + signers + forms + flags.
- [x] Frontend — types/steps/signers + forms/flags.
- [x] Docs — backend/frontend/database.
- [x] Test — cakupan signature.

## 7. Catatan / TODO

- [ ] Mesin status approval (evaluasi `condition`, auto-`APPROVED`) belum
      diimplementasikan — saat ini CRUD master/transaksi.
- [ ] Notifikasi ke signer berikutnya.
- [ ] Lampiran bukti tanda tangan (`UploadHandler` belum diregistrasi).
- [ ] `app_signature_flag` tanpa FK ke `app_user_company` (cek konsistensi).
