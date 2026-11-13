/**
 * Port auth & MFA. Token tidak pernah kembali ke pemanggil — proxy BFF
 * mengelola cookie HttpOnly; pemanggil hanya menerima entitas aman.
 */

import type {
  CompanyAccess,
  CompanyPublic,
  LoginOutcome,
  MenuNode,
  MfaSetupData,
  NavigationData,
} from '../entities/auth'

export interface LoginInput {
  /** UUID company; string kosong = "Local / Global Login". */
  company_id: string
  username: string
  password: string
}

export interface MfaVerifyInput {
  otp?: string
  backup_code?: string
}

export interface MfaDisableInput {
  password: string
  otp: string
}

export interface IMeGateway {
  /** `GET /me/navigation` — company akses + pohon menu (can_view=true saja). */
  navigation(): Promise<NavigationData>
}

export interface IAuthGateway {
  companies(): Promise<CompanyPublic[]>
  login(input: LoginInput): Promise<LoginOutcome>
  mfaVerify(input: MfaVerifyInput): Promise<{ activeCompanyId: string | null; mfaResetViaBackup: boolean }>
  switchCompany(companyId: string): Promise<{ activeCompanyId: string | null }>
  logout(): Promise<void>

  mfaSetup(): Promise<MfaSetupData>
  mfaEnable(otp: string): Promise<void>
  mfaDisable(input: MfaDisableInput): Promise<void>
  mfaResetRequest(username: string, email: string): Promise<void>
  mfaResetConfirm(username: string, token: string): Promise<void>
}

/** Helper tipe: flattening pohon menu (urut DFS) untuk sidebar & guard. */
export function flattenMenus(nodes: readonly MenuNode[]): MenuNode[] {
  const out: MenuNode[] = []
  for (const node of nodes) {
    out.push(node)
    out.push(...flattenMenus(node.children))
  }
  return out
}

/** Kumpulan company akses (dipakai switcher + guard). */
export type NavigationBundle = NavigationData & { accessList: readonly CompanyAccess[] }
