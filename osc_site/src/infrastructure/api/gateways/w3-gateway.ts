/**
 * Gateway Wave 3 — implementasi port `ISecOpsGateway`, `IPamGateway`,
 * `INotificationGateway` via BFF proxy (`/api/proxy/v1/...`, cookie HttpOnly
 * → Bearer server-side). Seluruh respons upstream divalidasi Zod.
 *
 * PAM authorize: error 403 MFA_REQUIRED_FOR_PAM / PAM_STEP_UP_REQUIRED /
 * PAM_POLICY_DENIED dipetakan menjadi varian domain `PamAuthorizeOutcome`
 * (bukan exception) agar alur Step-Up OTP di UI eksplisit.
 */

import { z } from 'zod'

import type {
  NotificationChannel,
  ChannelType,
  PamAccount,
  PamAuthorizeOutcome,
  PamSession,
  SecOpsOverview,
  SecurityAlertEvent,
  VulnerabilityFinding,
} from '@/domain/entities/w3'
import type {
  INotificationGateway,
  IPamGateway,
  ISecOpsGateway,
} from '@/domain/gateways/w3'
import { ApiClientError } from '@/domain/errors'
import { apiJson, jsonInit, proxyFetch, toClientError } from '@/infrastructure/api/client'
import {
  notificationChannelListSchema,
  notificationChannelSchema,
  pamAccountListSchema,
  pamAuthorizeResultSchema,
  pamSessionListSchema,
  secopsOverviewSchema,
  securityAlertListSchema,
  vulnerabilityListSchema,
} from '@/infrastructure/api/schemas'

export class SecOpsGateway implements ISecOpsGateway {
  async getOverview(): Promise<SecOpsOverview> {
    return apiJson('/v1/secops/overview', secopsOverviewSchema)
  }

  async listAlerts(): Promise<SecurityAlertEvent[]> {
    return apiJson('/v1/secops/alerts', securityAlertListSchema)
  }

  async listVulnerabilities(): Promise<VulnerabilityFinding[]> {
    return apiJson('/v1/secops/vulnerabilities', vulnerabilityListSchema)
  }
}

export class PamGateway implements IPamGateway {
  async listAccounts(): Promise<PamAccount[]> {
    return apiJson('/v1/pam/accounts', pamAccountListSchema)
  }

  async listSessions(): Promise<PamSession[]> {
    return apiJson('/v1/pam/sessions', pamSessionListSchema)
  }

  async authorize(input: {
    account_id: string
    otp?: string
    reason?: string
    duration_minutes?: number
  }): Promise<PamAuthorizeOutcome> {
    const res = await proxyFetch('/v1/pam/sessions/authorize', jsonInit('POST', input))
    if (res.ok) {
      const body = (await res.json()) as { data?: unknown }
      const parsed = pamAuthorizeResultSchema.safeParse(body.data ?? body)
      if (parsed.success) return { kind: 'authorized', data: parsed.data }
      return {
        kind: 'error',
        error: new ApiClientError(
          'RESPONSE_INVALID',
          'Struktur respons backend tidak dikenali',
          res.status,
          res.headers.get('x-correlation-id'),
        ),
      }
    }
    const error = await toClientError(res)
    if (error.code === 'MFA_REQUIRED_FOR_PAM') {
      return { kind: 'mfa_required', message: error.message }
    }
    if (error.code === 'PAM_STEP_UP_REQUIRED') {
      return { kind: 'step_up_required', message: error.message }
    }
    if (error.code === 'PAM_POLICY_DENIED') {
      return { kind: 'policy_denied', message: error.message }
    }
    return { kind: 'error', error }
  }
}

export class NotificationGateway implements INotificationGateway {
  async listChannels(): Promise<NotificationChannel[]> {
    return apiJson('/v1/notifications/channels', notificationChannelListSchema)
  }

  async createChannel(input: {
    channel_type: ChannelType
    config: Record<string, unknown>
    event_filter?: string[]
    is_active?: boolean
  }): Promise<{ id: string }> {
    return apiJson(
      '/v1/notifications/channels',
      z.object({ id: z.string().min(1) }),
      jsonInit('POST', input),
    )
  }

  async updateChannel(
    id: string,
    input: {
      config?: Record<string, unknown>
      event_filter?: string[]
      is_active?: boolean
    },
  ): Promise<NotificationChannel> {
    return apiJson(
      `/v1/notifications/channels/${encodeURIComponent(id)}`,
      notificationChannelSchema,
      jsonInit('PUT', input),
    )
  }

  async deleteChannel(id: string): Promise<void> {
    const res = await proxyFetch(`/v1/notifications/channels/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw await toClientError(res)
  }
}

