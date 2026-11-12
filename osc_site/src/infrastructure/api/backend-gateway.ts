/**
 * Gateway backend untuk komponen klien (browser) — selalu lewat BFF proxy
 * internal `/api/proxy/...` (cookie HttpOnly dikirim otomatis same-origin).
 * Untuk Server Components, gunakan adapter `infrastructure/api/rust-api.ts`
 * (server-to-server via `RUST_API_INTERNAL_URL`).
 */

import { z } from 'zod'

import type { ApiHealthSnapshot } from '@/domain/entities'
import type { IBackendGateway } from '@/domain/gateways'
import { proxyFetch } from '@/infrastructure/http/proxy-client'

const apiHealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: z.enum(['up', 'down']),
    storage: z.enum(['up', 'down']),
  }),
})

export class BackendGateway implements IBackendGateway {
  async apiHealth(): Promise<ApiHealthSnapshot | null> {
    try {
      const res = await proxyFetch('/v1/health')
      if (!res.ok) return null
      const parsed = apiHealthSchema.safeParse(await res.json())
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}
