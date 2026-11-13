import type { CompanyPublic } from '@/domain/entities/auth'
import { appConfig } from '@/infrastructure/config'
import { companyPublicSchema } from '@/infrastructure/api/schemas'
import { LoginForm } from '@/presentation/components/auth/login-form'

/**
 * Halaman Login Dual-Mode & MFA.
 * Daftar company diambil server-side (endpoint publik) agar dropdown terisi
 * sebelum hydrasi — fallback client-side tetap tersedia di LoginForm.
 */

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  let companies: CompanyPublic[] = []
  try {
    const res = await fetch(`${appConfig.rustApiInternalUrl}/api/v1/auth/companies`, {
      headers: { accept: 'application/json', 'x-correlation-id': crypto.randomUUID() },
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    })
    if (res.ok) {
      const body = (await res.json()) as { data?: { companies?: unknown } }
      const parsed = companyPublicSchema.array().safeParse(body.data?.companies ?? [])
      if (parsed.success) companies = parsed.data
    }
  } catch {
    companies = []
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <LoginForm initialCompanies={companies} />
    </main>
  )
}
