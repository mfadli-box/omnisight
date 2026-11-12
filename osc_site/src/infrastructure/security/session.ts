/**
 * Sesi BFF — token HANYA berpindah via cookie HttpOnly yang dikelola
 * server-side. Penetapan cookie (setelah login) diimplementasikan pada
 * fase auth; proxy sudah siap membaca & meneruskannya sebagai Bearer.
 */

import type { NextRequest } from 'next/server'

/** Nama cookie sesi BFF (HttpOnly, Secure, SameSite=Lax). */
export const SESSION_COOKIE = 'osc_session'

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
