'use client'

/**
 * Konteks navigasi App Shell — data `/me/navigation` diambil server-side
 * (layout), lalu dibagikan ke sidebar, switcher, dan Route Guard.
 * `refreshNavigation` memicu `router.refresh()` (RSC re-render) setelah
 * switch company sehingga seluruh state halaman memakai konteks baru.
 */

import { createContext, useContext } from 'react'

import type { NavigationData } from '@/domain/entities/auth'

export interface NavigationContextValue {
  navigation: NavigationData
}

export const NavigationContext = createContext<NavigationContextValue | null>(null)

export function useNavigationContext(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) {
    throw new Error('useNavigationContext harus dipakai di dalam NavigationProvider')
  }
  return ctx
}
