import { redirect } from 'next/navigation'
import Link from 'next/link'

import { fetchNavigationServer } from '@/infrastructure/api/server-api'

/**
 * Landing → arahkan sesuai status sesi (cookie HttpOnly dibaca server-side;
 * tidak ada kebocoran token ke browser).
 */
export default async function HomePage() {
  const navigation = await fetchNavigationServer()
  if (navigation !== null) redirect('/dashboard')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">omnisight</h1>
      <p className="max-w-md text-balance text-muted-foreground">
        Unified Enterprise IT, Network, Container &amp; SecOps Platform.
      </p>
      <Link
        href="/login"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Masuk
      </Link>
    </main>
  )
}
