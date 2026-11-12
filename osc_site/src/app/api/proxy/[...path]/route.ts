/**
 * Secure API Proxy (BFF) — satu-satunya pintu browser -> Rust API.
 *
 * Semua logika keamanan ada di `infrastructure/api/rust-api.ts`:
 * method allowlist, normalisasi anti-traversal + path whitelist (SSRF),
 * Origin/Referer same-origin (CSRF, method mutating), cookie HttpOnly ->
 * `Authorization: Bearer`, header allowlist, dan passthrough streaming
 * dua arah tanpa buffering.
 *
 * Default-deny: endpoint baru HARUS didaftarkan di
 * `infrastructure/security/proxy-policy.ts` sebelum bisa diproxy.
 */

import type { NextRequest } from 'next/server'

import { forwardToRustApi } from '@/infrastructure/api/rust-api'

export const runtime = 'nodejs' // streaming body & cookie API lengkap
export const dynamic = 'force-dynamic' // tidak pernah di-cache

async function handler(req: NextRequest): Promise<Response> {
  const result = await forwardToRustApi(req)
  return result.response
}

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
}
