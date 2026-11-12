/**
 * Use case: login dual-mode + step-2 MFA.
 * State machine murni (bebas React) — dipakai login form presentation/.
 */

import type { LoginOutcome } from '@/domain/entities/auth'
import type { IAuthGateway, LoginInput, MfaVerifyInput } from '@/domain/gateways/auth'

export type LoginStep = 'credentials' | 'mfa-otp' | 'mfa-backup'

export interface LoginState {
  step: LoginStep
  /** Error kode dari upstream (mis. RATE_LIMITED, HRIS_UPSTREAM_INVALID_RESPONSE). */
  errorCode: string | null
  errorMessage: string | null
  /** `true` bila login sukses via cache offline HRIS (banner informatif). */
  offlineCache: boolean
}

export const INITIAL_LOGIN_STATE: LoginState = {
  step: 'credentials',
  errorCode: null,
  errorMessage: null,
  offlineCache: false,
}

/** Step-1: kredensial + company (dropdown dual-mode). */
export async function submitCredentials(
  gateway: IAuthGateway,
  input: LoginInput,
): Promise<{ outcome: LoginOutcome; state: LoginState }> {
  const outcome = await gateway.login(input)
  if (outcome.mfa_required) {
    return { outcome, state: { ...INITIAL_LOGIN_STATE, step: 'mfa-otp' } }
  }
  return { outcome, state: { ...INITIAL_LOGIN_STATE, offlineCache: outcome.offlineCache } }
}

/** Step-2: verifikasi OTP atau backup code (backup code → MFA auto-reset). */
export async function submitMfaChallenge(
  gateway: IAuthGateway,
  input: MfaVerifyInput,
): Promise<{ activeCompanyId: string | null; mfaResetViaBackup: boolean }> {
  return gateway.mfaVerify(input)
}

/** Label input identitas dinamis sesuai mode company terpilih. */
export function identityLabel(hrisEnabled: boolean): string {
  return hrisEnabled ? 'HRIS ID' : 'Username'
}
