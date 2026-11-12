/**
 * Use case: guard navigasi berbasis pohon MenuModule.
 * Murni (murni fungsi) — dipakai Route Guard presentation/ & layout server.
 */

import type { MenuNode } from '@/domain/entities/auth'
import { flattenMenus } from '@/domain/gateways/auth'

/** Route yang selalu boleh diakses user terautentikasi (di luar menu DB). */
export const ALWAYS_ALLOWED_ROUTES: readonly string[] = [
  '/dashboard',
  '/profile/security',
]

/**
 * Kumpulan route path yang diizinkan dari pohon menu.
 * `route_path` kosong/null diabaikan (item non-navigasi, mis. grup).
 */
export function allowedRoutePaths(menus: readonly MenuNode[]): string[] {
  return flattenMenus(menus)
    .map((n) => n.route_path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
}

/**
 * Cek privilege: path diakses hanya bila sama dengan (atau sub-path dari)
 * salah satu route menu ATAU termasuk route statis yang selalu diizinkan.
 * Pencocokan case-insensitive, trailing slash diabaikan.
 */
export function isRouteAllowed(menus: readonly MenuNode[], pathname: string): boolean {
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/'
  if (ALWAYS_ALLOWED_ROUTES.includes(clean)) return true
  const allowed = allowedRoutePaths(menus)
  return allowed.some((route) => {
    const r = route.replace(/\/+$/, '')
    return clean === r || clean.startsWith(`${r}/`)
  })
}
