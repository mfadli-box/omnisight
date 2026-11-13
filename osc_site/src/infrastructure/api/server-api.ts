/**
 * Server-side API adapter untuk Server Components / Route Handlers:
 * server-to-server langsung ke `RUST_API_INTERNAL_URL` (bukan lewat proxy
 * HTTP diri-sendiri), membawa `Authorization: Bearer` dari cookie HttpOnly.
 */

import { cookies } from 'next/headers'
import { z } from 'zod'

import type { NavigationData } from '@/domain/entities/auth'
import { appConfig } from '@/infrastructure/config'
import { isAllowedPath } from '@/infrastructure/security/proxy-policy'
import { SESSION_COOKIE } from '@/infrastructure/security/session'

/** Bearer token sesi dari cookie HttpOnly (server components). */
export async function sessionTokenFromCookies(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token || token.length === 0 || token.length > 4096 || /[\s\0]/.test(token)) {
    return null
  }
  return token
}

/** GET JSON ke upstream (path upstream `/api/v1/...`, whitelist-divalidasi). */
async function serverGetJson(upstreamPath: string): Promise<Response | null> {
  if (!isAllowedPath(upstreamPath)) return null
  const token = await sessionTokenFromCookies()
  if (!token) return null
  try {
    return await fetch(`${appConfig.rustApiInternalUrl}${upstreamPath}`, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-correlation-id': crypto.randomUUID(),
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(appConfig.timeoutMs),
      cache: 'no-store',
    })
  } catch {
    return null
  }
}

/**
 * Ambil navigasi (`/me/navigation`) untuk App Shell & Route Guard.
 * Mengembalikan `null` bila belum login / upstream gagal / 401.
 */
export async function fetchNavigationServer(): Promise<NavigationData | null> {
  const { navigationSchema } = await import('@/infrastructure/api/schemas')
  const res = await serverGetJson('/api/v1/me/navigation')
  if (!res || !res.ok) return null
  try {
    const body = (await res.json()) as { data?: unknown }
    const parsed = navigationSchema.safeParse(body.data ?? body)
    if (!parsed.success) return null
    return {
      activeCompanyId: parsed.data.active_company_id,
      companies: parsed.data.companies,
      menus: parsed.data.menus,
    }
  } catch {
    return null
  }
}

/** Skema ringan dipakai ulang middleware/dashboard. */
export const dashboardHealthSchema = z.object({
  status: z.string(),
})
