/**
 * Use case murni Wave 2 — dipakai komponen presentasi `infra/`.
 * Tanpa React/fetch: hanya transformasi data & aturan tampilan.
 */

import type { MenuNode } from '@/domain/entities/auth'
import type { LogLevel, SseLogEvent } from '@/domain/entities/infra'

// ---------- Privilege menu (menghormati Company aktif) ----------

export interface MenuPrivilege {
  exists: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

const NO_PRIVILEGE: MenuPrivilege = {
  exists: false,
  can_create: false,
  can_update: false,
  can_delete: false,
}

function findMenu(nodes: readonly MenuNode[], code: string): MenuNode | null {
  for (const node of nodes) {
    if (node.code === code) return node
    const found = findMenu(node.children, code)
    if (found) return found
  }
  return null
}

/** Privilege CRUD dari pohon menu (`/me/navigation`, server-side filtered). */
export function menuPrivilege(menus: readonly MenuNode[], code: string): MenuPrivilege {
  const node = findMenu(menus, code)
  if (!node) return NO_PRIVILEGE
  return {
    exists: true,
    can_create: node.can_create,
    can_update: node.can_update,
    can_delete: node.can_delete,
  }
}

// ---------- Metrik & format ----------

/** Persentase aman (null bila data tidak lengkap). */
export function ratioPct(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null
  return Math.min(100, Math.max(0, (used / total) * 100))
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3_600)
  const m = Math.floor((seconds % 3_600) / 60)
  return d > 0 ? `${d}h ${h}j ${m}m` : h > 0 ? `${h}j ${m}m` : `${m}m`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return '—'
  return t.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Ambil angka dari record JSONB snapshot metrik (key snake_case). */
export function numField(data: Record<string, unknown>, key: string): number | null {
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Ambil string dari record JSONB snapshot (S.M.A.R.T., dsb.). */
export function strField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

// ---------- Uptime & SSL expiry ----------

export type SslState = 'OK' | 'WARNING' | 'EXPIRED' | 'UNKNOWN'

export interface SslExpiryRow {
  monitorId: string
  name: string
  expiryText: string
  state: SslState
  daysRemaining: number | null
  status: string | null
}

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?\b/
/** Frasa yang dipancarkan agent network_poller untuk masa berlaku sertifikat. */
const EXPIRY_HINTS = /ssl|tls|cert|sertifikat|expired?|expir(?:y|es|ation)/i

/** Ekstrak tanggal kedaluwarsa SSL dari pesan heartbeat monitor HTTPS/KEYWORD. */
export function extractCertExpiry(message: string | null): string | null {
  if (!message || !EXPIRY_HINTS.test(message)) return null
  const match = ISO_DATE.exec(message)
  return match ? (match[2] ? `${match[1]}T${match[2]}` : match[1]) : null
}

export function sslExpiryState(expiryText: string | null): {
  state: SslState
  daysRemaining: number | null
} {
  if (!expiryText) return { state: 'UNKNOWN', daysRemaining: null }
  const t = new Date(expiryText).getTime()
  if (Number.isNaN(t)) return { state: 'UNKNOWN', daysRemaining: null }
  const days = Math.floor((t - Date.now()) / 86_400_000)
  if (days < 0) return { state: 'EXPIRED', daysRemaining: days }
  if (days < 30) return { state: 'WARNING', daysRemaining: days }
  return { state: 'OK', daysRemaining: days }
}

/** Baris tabel expiry SSL dari rollup monitor publik (HTTPS/KEYWORD saja). */
export function sslExpiryRows(
  rollups: ReadonlyArray<{
    id: string
    name: string
    type: string
    status: string | null
    message: string | null
  }>,
): SslExpiryRow[] {
  const rows: SslExpiryRow[] = []
  for (const m of rollups) {
    if (m.type !== 'HTTPS' && m.type !== 'KEYWORD') continue
    const expiryText = extractCertExpiry(m.message)
    if (!expiryText) continue
    const { state, daysRemaining } = sslExpiryState(expiryText)
    rows.push({
      monitorId: m.id,
      name: m.name,
      expiryText,
      state,
      daysRemaining,
      status: m.status,
    })
  }
  return rows
}

// ---------- Log SSE tampilan ----------

export function logLevelVariant(level: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (level.toUpperCase() as LogLevel | string) {
    case 'ERROR':
      return 'destructive'
    case 'WARN':
      return 'warning'
    case 'INFO':
      return 'success'
    default:
      return 'secondary'
  }
}

/** Baris log tampilan (capped agar memori browser aman). */
export interface LogLine {
  id: number
  ts: string
  level: string
  source: string
  message: string
}

export function toLogLine(event: SseLogEvent, id: number): LogLine {
  return {
    id,
    ts: event.ts,
    level: event.level.toUpperCase(),
    source: event.source,
    message: event.message,
  }
}

export const MAX_LOG_LINES = 300

// ---------- Template editor ----------

export const COMPOSE_TEMPLATE = `services:
  web:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "8080:80"
`

export const VHOST_TEMPLATE = `server {
  listen 80;
  server_name app.example.com;
  location / {
    proxy_pass http://app;
  }
}
`

export const DISPATCH_COMMANDS = ['up', 'down', 'pull', 'restart'] as const

export const DISPATCH_LABELS: Record<(typeof DISPATCH_COMMANDS)[number], string> = {
  up: 'Deploy / Up',
  down: 'Stop / Down',
  pull: 'Pull Images',
  restart: 'Restart',
}

export const VHOST_STATUS_VARIANT: Record<
  string,
  'success' | 'warning' | 'destructive' | 'secondary'
> = {
  APPLIED: 'success',
  TESTING: 'warning',
  DRAFT: 'secondary',
  FAILED: 'destructive',
  ROLLED_BACK: 'warning',
}

export const DRIFT_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  IN_SYNC: 'success',
  DRIFTED: 'warning',
  UNKNOWN: 'secondary',
}

export const MONITOR_STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  UP: 'success',
  DOWN: 'destructive',
  PENDING: 'warning',
  MAINTENANCE: 'secondary',
}
