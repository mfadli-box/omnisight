/**
 * Typed HTTP client untuk komponen klien (browser).
 * ATURAN: SELALU menuju BFF proxy internal `/api/proxy/...`; tidak pernah
 * langsung ke Rust API. Cookie HttpOnly dikirim browser secara same-origin.
 */

const PROXY_BASE = '/api/proxy'

export async function proxyFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const clean = path.startsWith('/') ? path : `/${path}`
  return fetch(`${PROXY_BASE}${clean}`, {
    credentials: 'same-origin',
    ...init,
  })
}
