/**
 * Use cases murni Wave 3: varian badge severity, format nilai, filter event
 * notification, URL WS bastion (ticket sekali-pakai) dan parser rekaman
 * asciinema cast v2 untuk Session Replay Viewer.
 */

import type { ChannelType, PamSessionStatus, Severity } from '@/domain/entities/w3'

// ---------- badge ----------
export const SEVERITY_VARIANT: Record<Severity, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'secondary',
  LOW: 'outline',
}

export const PAM_STATUS_VARIANT: Record<PamSessionStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVE: 'default',
  AUTHORIZED: 'secondary',
  CLOSED: 'outline',
  REQUESTED: 'secondary',
  DENIED: 'destructive',
  EXPIRED: 'outline',
}

// ---------- format ----------
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// ---------- notification channels ----------
export const CHANNEL_LABELS: Record<ChannelType, string> = {
  SMTP_EMAIL: 'SMTP Email',
  TELEGRAM: 'Telegram',
  WEBHOOK: 'Webhook',
}

/** Katalog event filter (≤32 entri, uppercase) — konsisten dengan dispatcher. */
export const EVENT_FILTER_PRESETS: readonly string[] = [
  'ALERT.FIRING',
  'ALERT.RESOLVED',
  'SIEM.CRITICAL',
  'PAM.SESSION_AUTHORIZED',
  'PAM.SESSION_DENIED',
  'MONITOR.DOWN',
  'UPTIME.RECOVERY',
]

export function buildChannelConfig(
  type: ChannelType,
  form: Record<string, string | boolean | number>,
): Record<string, unknown> {
  if (type === 'SMTP_EMAIL') {
    return {
      host: String(form.host ?? ''),
      port: Number(form.port ?? 587),
      username: form.username ? String(form.username) : undefined,
      password: form.password ? String(form.password) : undefined,
      from_email: String(form.from_email ?? ''),
      use_tls: Boolean(form.use_tls ?? true),
    }
  }
  if (type === 'TELEGRAM') {
    return {
      bot_token: String(form.bot_token ?? ''),
      chat_id: String(form.chat_id ?? ''),
      parse_mode: form.parse_mode ? String(form.parse_mode) : undefined,
    }
  }
  return {
    url: String(form.url ?? ''),
    secret: form.secret ? String(form.secret) : undefined,
  }
}

// ---------- PAM terminal & replay ----------
/**
 * Bangun URL WebSocket bastion dari ticket ephemeral (sekali-pakai).
 * Gateway base dikonfigurasi via env publik — browser hanya memegang ticket
 * ber-TTL pendek, bukan cookie/JWT. Default mengikuti origin saat ini.
 */
export function buildBastionWsUrl(sessionId: string, ticket: string): string {
  const base =
    process.env.NEXT_PUBLIC_PAM_GATEWAY_WS_URL ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
  const clean = base.replace(/\/+$/, '')
  return `${clean}/ws/pam/${encodeURIComponent(sessionId)}?ticket=${encodeURIComponent(ticket)}`
}

export function ticketCountdownLabel(expiresInMs: number): string {
  const s = Math.max(0, Math.ceil(expiresInMs / 1000))
  return s > 0 ? `Ticket aktif ${s}s` : 'Ticket kedaluwarsa'
}

/** Event asciinema cast v2: header JSON + baris [time, type, data]. */
export interface ReplayEvent {
  time: number
  data: string
}

/**
 * Parse isi rekaman `.cast` (teks asciinema v2) menjadi event replay.
 * Baris non-JSON diabaikan (aman terhadap metadata tambahan).
 */
export function parseCast(content: string): ReplayEvent[] {
  const events: ReplayEvent[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || !trimmed.startsWith('[')) continue
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (
        Array.isArray(parsed) &&
        parsed.length >= 3 &&
        typeof parsed[0] === 'number' &&
        typeof parsed[2] === 'string'
      ) {
        events.push({ time: parsed[0], data: parsed[2] })
      }
    } catch {
      // baris metadata/korup — lewati
    }
  }
  return events
}

/** Header cast v2 (baris pertama) — durasi total untuk playback. */
export function castDuration(events: ReplayEvent[]): number {
  return events.length > 0 ? events[events.length - 1].time : 0
}
