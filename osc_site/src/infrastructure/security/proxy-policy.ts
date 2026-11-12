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
 * Pola path UPSTREAM yang boleh diproxy.
 * Catatan: perluasan endpoint per fitur WAJIB ditambahkan di sini —
 * default-deny, bukan default-allow.
 */
const ALLOWED_PATH_PATTERNS: readonly RegExp[] = [
  /^\/api\/v1\/health$/,
  // Fase auth (login/refresh/logout mengeluarkan cookie HttpOnly):
  /^\/api\/v1\/auth\/(?:login|refresh|logout)$/,
  // Contoh resource CRUD (fase fitur):
  /^\/api\/v1\/users(?:\/[\w-]+)?$/,
  // Fase excel:
  /^\/api\/v1\/excel\/[\w-]+\/(?:import|export)$/,
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
 * gateway kontrak osc_rest: `/api/proxy/<X>` → `/api/<X>`, tabel mapping
 * osc_docs/site) — atau `null` bila mencurigakan. TIDAK pernah membentuk
 * URL dari input mentah user.
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
  // Segmen sudah disanitasi (tanpa `.`/`..`), sehingga prefix ini tidak
  // bisa di-escape lewat traversal.
  return `/api/${encoded.join('/')}`
}

export function isAllowedPath(upstreamPath: string): boolean {
  return ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(upstreamPath))
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
  for (const name of ['accept', 'accept-language', 'content-type'] as const) {
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
    const name of ['content-type', 'content-disposition', 'content-length', 'cache-control'] as const
  ) {
    const value = source.get(name)
    if (value) target.set(name, value)
  }
}
