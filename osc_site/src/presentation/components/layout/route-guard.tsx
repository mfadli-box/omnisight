'use client'

/**
 * Route Guard — re-verifikasi privilege di klien berdasarkan pohon menu
 * (`can_view=false` tidak pernah dikirim server; server tetap memfilter,
 * guard ini hanya UX defense-in-depth untuk URL yang diketik manual).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { isRouteAllowed } from '@/application/usecases/navigation'
import { useNavigationContext } from '@/presentation/hooks/navigation-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/presentation/components/ui/card'

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { navigation } = useNavigationContext()
  const pathname = usePathname()

  if (isRouteAllowed(navigation.menus, pathname)) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>403 — Akses ditolak</CardTitle>
          <CardDescription>
            Anda tidak memiliki privilege pada menu <code className="text-xs">{pathname}</code>{' '}
            untuk company/role aktif. Hubungi administrator bila ini keliru.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"
          >
            Kembali ke Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
