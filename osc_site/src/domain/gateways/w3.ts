/** Port Wave 3: SecOps, PAM Bastion dan Notification Channels. */

import type {
  NotificationChannel,
  ChannelType,
  PamAccount,
  PamAuthorizeOutcome,
  PamSession,
  SecOpsOverview,
  SecurityAlertEvent,
  VulnerabilityFinding,
} from '../entities/w3'

export interface ISecOpsGateway {
  getOverview(): Promise<SecOpsOverview>
  listAlerts(): Promise<SecurityAlertEvent[]>
  listVulnerabilities(): Promise<VulnerabilityFinding[]>
}

export interface IPamGateway {
  listAccounts(): Promise<PamAccount[]>
  listSessions(): Promise<PamSession[]>
  /** Otorisasi sesi — error MFA/step-up/policy dipetakan ke varian domain. */
  authorize(input: {
    account_id: string
    otp?: string
    reason?: string
    duration_minutes?: number
  }): Promise<PamAuthorizeOutcome>
}

export interface INotificationGateway {
  listChannels(): Promise<NotificationChannel[]>
  createChannel(input: {
    channel_type: ChannelType
    config: Record<string, unknown>
    event_filter?: string[]
    is_active?: boolean
  }): Promise<{ id: string }>
  updateChannel(
    id: string,
    input: {
      config?: Record<string, unknown>
      event_filter?: string[]
      is_active?: boolean
    },
  ): Promise<NotificationChannel>
  deleteChannel(id: string): Promise<void>
}
