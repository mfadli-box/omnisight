/**
 * Entitas auth & MFA (kontrak `osc_docs/rest/contracts/w1.openapi.yaml`).
 * Token JWT TIDAK PERNAH menjadi bagian dari entitas yang sampai ke browser —
 * proxy BFF menyimpannya di cookie HttpOnly dan menstrip token dari body.
 */

/** Company publik dari `GET /auth/companies` (URL/secret HRIS tidak diekspos). */
export interface CompanyPublic {
  id: string
  name: string
  code: string
  hris_enabled: boolean
}

/** Ringkasan user pada respons login sukses. */
export interface UserSummary {
  id: string
  username: string
  email: string
  display_name: string | null
  mfa_enabled: boolean
  is_super_admin: boolean
  last_hris_sync_at: string | null
}

/** Hasil login step-1 (tanpa MFA) — token sudah disetel proxy sebagai cookie. */
export interface LoginSessionData {
  mfa_required: false
  user: UserSummary
  activeCompanyId: string | null
  offlineCache: boolean
}

/** Hasil login step-1 (MFA aktif) — challenge token disimpan proxy di cookie HttpOnly. */
export interface LoginMfaChallenge {
  mfa_required: true
}

export type LoginOutcome = LoginSessionData | LoginMfaChallenge

/** Baris akses company user dari `GET /me/navigation`. */
export interface CompanyAccess {
  id: string
  name: string
  code: string
  hris_enabled: boolean
  role_id: string | null
  role_name: string | null
  is_default: boolean
  is_active_company: boolean
}

/** Node pohon MenuModule (`can_view=false` tidak pernah dikirim server). */
export interface MenuNode {
  id: string
  code: string
  label: string
  route_path: string | null
  icon: string | null
  sort_order: number
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  children: MenuNode[]
}

/** Data `GET /me/navigation`. */
export interface NavigationData {
  activeCompanyId: string | null
  companies: CompanyAccess[]
  menus: MenuNode[]
}

/** Data `POST /auth/mfa/setup` (backup code plaintext HANYA di respons ini). */
export interface MfaSetupData {
  secretBase32: string
  otpauthUrl: string
  backupCodes: string[]
}
