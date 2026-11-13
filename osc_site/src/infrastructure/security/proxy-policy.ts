/**
 * Security policy untuk BFF proxy — murni fungsi, mudah di-unit-test.
 * Prinsip SSRF: base URL upstream ADALAH konfigurasi tetap (bukan input
 * user); hanya METHOD + PATH + HEADER yang lolos allowlist yang diteruskan.
 */

import { appConfig } from '@/infrastructure/config'

/** Prefix route proxy di dalam Next.js (catch-all `[...path]`). */
export const PROXY_PREFIX = '/api/proxy/'

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Pola path UPSTREAM yang boleh diproxy — Wave 1 (api-w1.md).
 * Default-deny: endpoint baru WAJIB didaftarkan di sini.
 */
const ALLOWED_PATH_PATTERNS: readonly RegExp[] = [
  /^\/api\/v1\/health$/,
  // Auth dual-mode + MFA + switcher:
  /^\/api\/v1\/auth\/companies$/,
  /^\/api\/v1\/auth\/login$/,
  /^\/api\/v1\/auth\/logout$/,
  /^\/api\/v1\/auth\/switch-company$/,
  /^\/api\/v1\/auth\/mfa\/(?:setup|enable|verify|disable|reset-request|reset-confirm)$/,
  // Navigasi & profil:
  /^\/api\/v1\/me\/navigation$/,
  // Studio (koleksi dinamis):
  /^\/api\/v1\/collections$/,
  /^\/api\/v1\/collections\/[a-z][a-z0-9_]{0,49}\/fields$/,
  /^\/api\/v1\/items\/[a-z][a-z0-9_]{0,49}$/,
  // ITAM:
  /^\/api\/v1\/assets$/,
  /^\/api\/v1\/assets\/[\w-]+$/,
  /^\/api\/v1\/assets\/[\w-]+\/(?:checkout|checkin)$/,
  /^\/api\/v1\/assets\/import$/,
  /^\/api\/v1\/assets\/export$/,
  /^\/api\/v1\/licenses$/,
  /^\/api\/v1\/tickets$/,
  // DCIM/IPAM:
  /^\/api\/v1\/dcim\/racks$/,
  /^\/api\/v1\/ipam\/prefixes$/,
  /^\/api\/v1\/ipam\/addresses$/,
  // RustFS files:
  /^\/api\/v1\/files$/,
  /^\/api\/v1\/files\/[\w-]+$/,
  // Wave 2 (api-w2.md) — Agent Enrollment (admin, token ditampilkan sekali):
  /^\/api\/v1\/agents\/enrollment-tokens$/,
  // Uptime & Status Pages (slug publik [a-z0-9-] juga mencakup UUID id tenant):
  /^\/api\/v1\/monitors$/,
  /^\/api\/v1\/monitors\/[\w-]+$/,
  /^\/api\/v1\/status-pages$/,
  /^\/api\/v1\/status-pages\/[a-z0-9-]{1,100}$/,
  // Docker Stack Control Plane:
  /^\/api\/v1\/docker\/hosts$/,
  /^\/api\/v1\/docker\/stacks$/,
  /^\/api\/v1\/docker\/stacks\/[\w-]+$/,
  /^\/api\/v1\/docker\/stacks\/[\w-]+\/dispatch$/,
  // Nginx Reverse Proxy Control Plane:
  /^\/api\/v1\/nginx\/nodes$/,
  /^\/api\/v1\/nginx\/vhosts$/,
  /^\/api\/v1\/nginx\/vhosts\/[\w-]+$/,
  /^\/api\/v1\/nginx\/vhosts\/[\w-]+\/dispatch$/,
  // Live Logs (SSE text/event-stream):
  /^\/api\/v1\/infra\/logs\/stream$/,
  // Wave 3 (api-w3.md) — SecOps (SIEM/FIM/CVE):
  /^\/api\/v1\/secops\/overview$/,
  /^\/api\/v1\/secops\/alerts$/,
  /^\/api\/v1\/secops\/vulnerabilities$/,
  // Wave 3 — PAM Bastion (vault & sesi; ticket redeem via HMAC gateway internal):
  /^\/api\/v1\/pam\/accounts$/,
  /^\/api\/v1\/pam\/accounts\/[\w-]+$/,
  /^\/api\/v1\/pam\/sessions$/,
  /^\/api\/v1\/pam\/sessions\/authorize$/,
  /^\/api\/v1\/pam\/sessions\/[\w-]+$/,
  /^\/api\/v1\/pam\/sessions\/[\w-]+\/recording$/,
  // Wave 3 — Notification Channels (config terenkripsi, secret di-mask):
  /^\/api\/v1\/notifications\/channels$/,
  /^\/api\/v1\/notifications\/channels\/[\w-]+$/,
  // CATATAN: endpoint agent HMAC (/agents/enroll, /agents/*/ingest,
  // /agents/uptime/ingest, /agents/logs) TIDAK diberitakan lewat proxy
  // browser — dipanggil langsung oleh agent `osc_auto` (HMAC, bukan JWT).
]

/** Header respons ke browser yang dipasang proxy (di atas header upstream). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
}

export function isAllowedMethod(method: string): boolean {
  return ALLOWED_METHODS.has(method)
}

export function requiresSameOrigin(method: string): boolean {
  return MUTATING_METHODS.has(method)
}

/**
 * Normalisasi path anti-traversal: decode per-segmen, tolak `.`, `..`,
 * backslash, NUL, segmen kosong, atau %-encoding tidak valid.
 * Mengembalikan path UPSTREAM final — SELALU ber-awalan `/api/` (prefix
 * gateway kontrak osc_rest: `/api/proxy/<X>` → `/api/<X>`) — atau `null`
 * bila mencurigakan. TIDAK pernah membentuk URL dari input mentah user.
 */
export function normalizeProxyPath(pathname: string): string | null {
  if (!pathname.startsWith(PROXY_PREFIX)) return null
  const raw = pathname.slice(PROXY_PREFIX.length)
  if (raw.length === 0) return null

  const segments = raw.split('/')
  const encoded: string[] = []
  for (const segment of segments) {
    if (segment.length === 0) return null
    let value: string
    try {
      value = decodeURIComponent(segment)
    } catch {
      return null // %-encoding tidak valid → tolak
    }
    if (value === '.' || value === '..') return null
    if (value.includes('/') || value.includes('\\') || value.includes('\0')) return null
    if (value.trim().length === 0) return null
    encoded.push(encodeURIComponent(value))
  }
  // Prefix gateway: browser memanggil `/api/proxy/<X>` → upstream `/api/<X>`.
  return `/api/${encoded.join('/')}`
}

export function isAllowedPath(upstreamPath: string): boolean {
  return ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(upstreamPath))
}

/** Correlation ID: UUID bila nilai terlihat wajar, else null. */
function saneCorrelationId(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  if (!/^[\w.-]+$/.test(trimmed)) return null
  return trimmed
}

/** Baca correlation ID dari klien (bila valid) atau generate UUID baru. */
export function resolveCorrelationId(headers: Headers): string {
  const fromClient =
    saneCorrelationId(headers.get('x-correlation-id')) ??
    saneCorrelationId(headers.get('x-request-id'))
  return fromClient ?? crypto.randomUUID()
}

/**
 * CSRF: method mutating wajib membawa Origin/Referer yang origin-nya sama
 * dengan `SITE_PUBLIC_URL`. (Cookie HttpOnly tetap diproteksi SameSite;
 * lapisan ini adalah defense-in-depth untuk route handler.)
 */
export function sameOriginOk(headers: Headers): boolean {
  const raw = headers.get('origin') ?? headers.get('referer')
  if (!raw) return false
  try {
    return new URL(raw).origin === appConfig.sitePublicUrl
  } catch {
    return false
  }
}

/** Header request yang BOLEH diteruskan ke upstream (allowlist). */
export function copyAllowedRequestHeaders(
  source: Headers,
  target: Headers,
): void {
  for (const name of [
    'accept',
    'accept-language',
    'content-type',
    // Propagasi trace end-to-end (di-echo upstream, UUIDv7 bila absen):
    'x-correlation-id',
  ] as const) {
    const value = source.get(name)
    if (value) target.set(name, value)
  }
}

/** Header upstream yang BOLEH diteruskan ke browser (allowlist). */
export function copyAllowedResponseHeaders(
  source: Headers,
  target: Headers,
): void {
  for (
    const name of [
      'content-type',
      'content-disposition',
      'content-length',
      'content-transfer-encoding',
      'cache-control',
      'x-correlation-id',
    ] as const
  ) {
    const value = source.get(name)
    if (value) target.set(name, value)
  }
}

/**
 * Sanitasi filename dari header `Content-Disposition` upstream (Excel export
 * & unduhan RustFS) — buang karakter berbahaya sebelum dipakai di browser.
 */
export function sanitizeFilename(contentDisposition: string | null): string {
  const fallback = 'export.xlsx'
  if (!contentDisposition) return fallback
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition)
  const raw = (utf8?.[1] ?? plain?.[1] ?? '').trim()
  if (raw.length === 0) return fallback
  // Hanya karakter aman: alfanumerik, spasi, titik, dash, underscore.
  const safe = raw.replace(/[^A-Za-z0-9 ._\-]/g, '_').replace(/\.{2,}/g, '.')
  return safe.length > 0 ? safe : fallback
}
