/**
 * Entitas & value object murni (mengikuti kontrak `osc_docs/rest/*.md`).
 * Timestamp memakai string ISO-8601 (Timestamptz dari PostgreSQL).
 */

export type UserRole = 'USER' | 'ADMIN'

export interface User {
  id: string
  email: string
  displayName: string | null
  role: UserRole
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CheckStatus = 'up' | 'down'
export type HealthStatus = 'ok' | 'degraded'

export interface ApiHealthSnapshot {
  status: HealthStatus
  checks: {
    database: CheckStatus
    storage: CheckStatus
  }
}
