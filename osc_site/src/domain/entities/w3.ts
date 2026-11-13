/**
 * Entitas Wave 3 (kontrak `osc_docs/rest/contracts/w3.openapi.yaml`):
 * SecOps (SIEM/FIM/CVE), PAM Bastion (vault, mandatory MFA, ephemeral ticket,
 * session recording) dan Notification Channels.
 *
 * Prinsip: SECRET TIDAK PERNAH tiba di UI — vault account, bot token, webhook
 * secret, dan WS ticket PAM hanya `has_*` boolean / sekali-tampil di memori.
 */

// ---------- SecOps ----------
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface SecOpsCounts {
  fim_unresolved: number
  alerts_unacknowledged: number
  vulnerabilities_open: number
}

export interface SecurityAlertEvent {
  id: string
  asset_id: string | null
  asset_name: string | null
  rule_name: string
  category: string | null
  severity: Severity
  mitre_tactic: string | null
  mitre_technique: string | null
  source_ip: string | null
  detected_at: string
  is_acknowledged: boolean
}

export interface FimEvent {
  id: string
  asset_id: string | null
  asset_name: string | null
  path: string
  event_type: 'CREATED' | 'MODIFIED' | 'DELETED' | 'ATTRIBUTE_CHANGED'
  detection_source: 'REALTIME' | 'SCHEDULED'
  baseline_version: number
  old_checksum: string | null
  new_checksum: string | null
  size_bytes: number | null
  detected_at: string
  is_resolved: boolean
}

export interface VulnerabilityFinding {
  id: string
  asset_id: string
  asset_name: string | null
  cve_id: string
  title: string
  severity: Severity
  cvss_score: number | null
  version_installed: string | null
  version_fixed: string | null
  first_detected_at: string | null
  last_detected_at: string
}

export interface SecOpsOverview {
  counts: SecOpsCounts
  fim_recent: FimEvent[]
}

// ---------- PAM ----------
export type PamAccountType = 'SSH_PASSWORD' | 'SSH_KEY' | 'DATABASE' | 'HTTP_ENDPOINT'

export interface PamAccount {
  id: string
  asset_id: string
  asset_name: string | null
  policy_id: string | null
  policy_name: string | null
  label: string
  account_type: PamAccountType
  username: string
  port: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PamSessionStatus =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'ACTIVE'
  | 'CLOSED'
  | 'DENIED'
  | 'EXPIRED'

export interface PamSession {
  id: string
  account_id: string
  account_label: string
  policy_id: string | null
  status: PamSessionStatus
  source_ip: string | null
  command_count: number | null
  recording_object_key: string | null
  denied_reason: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  created_at: string
}

export interface PamAuthorizeResult {
  session_id: string
  gateway: string
  /** Ephemeral ticket — SEKALI tampil, hanya hidup di memori komponen. */
  ticket: string
  ticket_ttl_seconds: number
  duration_minutes: number
  account: {
    id: string
    label: string
    username: string
    account_type: string
    asset_id: string
    port: number
  }
  policy: {
    id: string
    name: string
    mfa_required: boolean
    command_filter: Record<string, unknown> | null
  }
}

/** Hasil otorisasi PAM — error MFA/step-up dipetakan menjadi varian domain. */
export type PamAuthorizeOutcome =
  | { kind: 'authorized'; data: PamAuthorizeResult }
  | { kind: 'mfa_required'; message: string }
  | { kind: 'step_up_required'; message: string }
  | { kind: 'policy_denied'; message: string }
  | { kind: 'error'; error: import('@/domain/errors').ApiClientError }

// ---------- Notification Channels ----------
export type ChannelType = 'SMTP_EMAIL' | 'TELEGRAM' | 'WEBHOOK'

/** Ringkasan config ter-mask — secret hanya `has_*` boolean. */
export interface ChannelConfigSummary {
  host?: string
  port?: number
  username?: string | null
  from_email?: string
  use_tls?: boolean
  has_password?: boolean
  chat_id?: string
  parse_mode?: string | null
  has_bot_token?: boolean
  url?: string
  scheme?: string
  has_secret?: boolean
}

export interface NotificationChannel {
  id: string
  type: ChannelType
  config: ChannelConfigSummary
  event_filter: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}
