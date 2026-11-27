---
code: MP-CM01-FE
module: CM01 (Identity & Auth Manager)
owner: ai-site
target_model: gpt-6.2-astra
reasoning_effort: high
token_optimization: true
---
# Task: Multi-Company Login Form, MFA TOTP Modal & Recovery Toast UI

## Fast Pre-Check (Token-Saving Guard)
```bash
test -s osc_site/src/app/(auth)/login/page.tsx && echo "LOGIN_PAGE_EXISTS" || echo "LOGIN_PAGE_MISSING"
```
- Jika `LOGIN_PAGE_EXISTS`: Respon `"Tugas CM01-FE (Login Page & MFA Modal) sudah selesai."` dan STOP.

## Input Context
- Backend API: `osc_rest` (`/api/v1/auth/login`, `/api/v1/auth/mfa/verify`)
- Target Folder: `osc_site`

## Objective & Scope
1. Implementasikan halaman login multi-company (`osc_site/src/app/(auth)/login/page.tsx`) dengan dropdown pemilih perusahaan.
2. Buat modal verifikasi TOTP MFA (`MFAModal.tsx`) 6-digit PIN input.
3. Tampilkan toast notification saat sistem beralih ke Fallback Recovery Password Mode.

## Acceptance Criteria
- [ ] User dapat memilih company dan melakukan autentikasi ke backend.
- [ ] Modal MFA muncul otomatis jika klausa `is_mfa_active = true`.
- [ ] UI terintegrasi dengan state management Zustand / React Context (`TenantContext`).

## Output Deliverables
- `osc_site/src/app/(auth)/login/page.tsx` & `src/components/auth/MFAModal.tsx`
- Catatan kerja: `osc_site/notes/MP-CM01-FE.md`