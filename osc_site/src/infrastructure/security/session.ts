/**
 * Sesi BFF — token HANYA berpindah via cookie HttpOnly yang dikelola
 * server-side oleh proxy. Tiga cookie:
 *  - `osc_session`       : access token sesi penuh (scope=access).
 *  - `osc_mfa_challenge` : challenge token sementara (scope=mfa_pending,
 *                          TTL 5 menit) — hanya dipakai `/auth/mfa/verify`.
 */

import type { NextRequest } from 'next/server'

/** Nama cookie sesi BFF (HttpOnly, Secure, SameSite=Lax). */
export const SESSION_COOKIE = 'osc_session'
/** Nama cookie challenge MFA (HttpOnly, TTL 5 menit sesuai JWT upstream). */
export const MFA_CHALLENGE_COOKIE = 'osc_mfa_challenge'

export interface CookieOptions {
  maxAge: number
}

/** Opsi cookie token — tidak pernah dibaca/di-set dari JavaScript. */
export function tokenCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

/** Masa berlaku cookie sesi: 24 jam (rotasi oleh switch-company/refresh). */
export const SESSION_MAX_AGE = 60 * 60 * 24
/** Challenge MFA: 5 menit (sesuai TTL JWT scope=mfa_pending). */
export const MFA_CHALLENGE_MAX_AGE = 5 * 60

/**
 * Baca token sesi dari cookie HttpOnly. Token TIDAK PERNAH di-embed ke
 * localStorage/sessionStorage dan TIDAK diteruskan apa adanya dari header
 * klien — hanya dari cookie yang dikontrol server.
 */
export function sessionTokenFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  // Sanity guard ringan: panjang wajar & tanpa whitespace/control char
  // (mencegah header injection melalui isi cookie).
  if (token.length === 0 || token.length > 4096) return null
  if (/[\s\0]/.test(token)) return null
  return token
}
