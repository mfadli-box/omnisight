import { redirect } from 'next/navigation'

import { fetchNavigationServer } from '@/infrastructure/api/server-api'
import { AppSidebar } from '@/presentation/components/layout/app-sidebar'
import { CompanySwitcher } from '@/presentation/components/layout/company-switcher'
import { RouteGuard } from '@/presentation/components/layout/route-guard'
import { UserMenu } from '@/presentation/components/layout/user-menu'
import { NavigationContext } from '@/presentation/hooks/navigation-context'

/**
 * App Shell Dinamis (route group `(app)`):
 *  - Navigasi diambil SERVER-SIDE dari `/me/navigation` (server-to-server,
 *    Bearer dari cookie HttpOnly) — gagal/401 → redirect /login.
 *  - Sidebar & switcher menerima data via NavigationContext (client).
 *  - RouteGuard re-verifikasi privilege berdasar pohon menu.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const navigation = await fetchNavigationServer()
  if (navigation === null) redirect('/login')

  const displayName =
    navigation.companies.find((c) => c.is_active_company)?.role_name ?? 'Operator'

  return (
    <NavigationContext.Provider value={{ navigation }}>
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between gap-3 border-b px-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tracking-tight">omnisight</span>
              <CompanySwitcher />
            </div>
            <UserMenu displayName={displayName} />
          </header>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <RouteGuard>{children}</RouteGuard>
          </main>
        </div>
      </div>
    </NavigationContext.Provider>
  )
}
