/**
 * Gateway auth & MFA (implementasi port domain) — client-side via BFF proxy.
 * Token tidak pernah kembali ke sini: proxy memindahkannya ke cookie
 * HttpOnly dan menstrip token dari body respons.
 */

import { z } from 'zod'

import type {
  CompanyPublic,
  LoginOutcome,
  MfaSetupData,
  NavigationData,
} from '@/domain/entities/auth'
import type {
  IAuthGateway,
  IMeGateway,
  LoginInput,
  MfaVerifyInput,
} from '@/domain/gateways/auth'
import { ApiClientError } from '@/domain/errors'
import { apiJson, jsonInit, proxyFetch, toClientError } from '@/infrastructure/api/client'
import {
  companyPublicSchema,
  loginOutcomeSchema,
  mfaSetupSchema,
  navigationSchema,
  sessionIssuedSchema,
} from '@/infrastructure/api/schemas'

export class AuthGateway implements IAuthGateway, IMeGateway {
  async companies(): Promise<CompanyPublic[]> {
    const data = await apiJson(
      '/v1/auth/companies',
      z.object({ companies: z.array(companyPublicSchema), count: z.number() }).passthrough(),
    )
    return data.companies
  }

  async login(input: LoginInput): Promise<LoginOutcome> {
    const res = await proxyFetch('/v1/auth/login', jsonInit('POST', input))
    if (!res.ok) throw await toClientError(res)
    const body = (await res.json()) as { data?: unknown }
    const parsed = loginOutcomeSchema.safeParse(body.data ?? body)
    if (!parsed.success) {
      throw new ApiClientError('RESPONSE_INVALID', 'Respons login tidak dikenali', res.status)
    }
    const data = parsed.data
    if (data.mfa_required) return { mfa_required: true }
    return {
      mfa_required: false,
      user: data.user,
      activeCompanyId: data.active_company_id,
      offlineCache: data.offline_cache,
    }
  }

  async mfaVerify(input: MfaVerifyInput): Promise<{ activeCompanyId: string | null; mfaResetViaBackup: boolean }> {
    const data = await apiJson(
      '/v1/auth/mfa/verify',
      sessionIssuedSchema,
      jsonInit('POST', input),
    )
    return { activeCompanyId: data.active_company_id, mfaResetViaBackup: data.mfa_reset_via_backup }
  }

  async switchCompany(companyId: string): Promise<{ activeCompanyId: string | null }> {
    const data = await apiJson(
      '/v1/auth/switch-company',
      sessionIssuedSchema,
      jsonInit('POST', { company_id: companyId }),
    )
    return { activeCompanyId: data.active_company_id }
  }

  async logout(): Promise<void> {
    await proxyFetch('/v1/auth/logout', { method: 'POST' })
  }

  async mfaSetup(): Promise<MfaSetupData> {
    const data = await apiJson('/v1/auth/mfa/setup', mfaSetupSchema, { method: 'POST' })
    return {
      secretBase32: data.secret_base32,
      otpauthUrl: data.otpauth_url,
      backupCodes: data.backup_codes,
    }
  }

  async mfaEnable(otp: string): Promise<void> {
    const res = await proxyFetch('/v1/auth/mfa/enable', jsonInit('POST', { otp }))
    if (!res.ok) throw await toClientError(res)
  }

  async mfaDisable(input: { password: string; otp: string }): Promise<void> {
    const res = await proxyFetch('/v1/auth/mfa/disable', jsonInit('POST', input))
    if (!res.ok) throw await toClientError(res)
  }

  async mfaResetRequest(username: string, email: string): Promise<void> {
    const res = await proxyFetch(
      '/v1/auth/mfa/reset-request',
      jsonInit('POST', { username, email }),
    )
    if (!res.ok) throw await toClientError(res)
  }

  async mfaResetConfirm(username: string, token: string): Promise<void> {
    const res = await proxyFetch(
      '/v1/auth/mfa/reset-confirm',
      jsonInit('POST', { username, token }),
    )
    if (!res.ok) throw await toClientError(res)
  }

  async navigation(): Promise<NavigationData> {
    const data = await apiJson('/v1/me/navigation', navigationSchema)
    return {
      activeCompanyId: data.active_company_id,
      companies: data.companies,
      menus: data.menus,
    }
  }
}
