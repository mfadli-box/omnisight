'use client'

/**
 * Sidebar navigasi dinamis — pohon MenuModule dari `/me/navigation`
 * (server-side filtering: node tanpa can_view tidak pernah dikirim upstream).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Activity,
  BellRing,
  Boxes,
  ChevronRight,
  Container,
  FileSpreadsheet,
  Folder,
  FolderTree,
  Globe,
  KeyRound,
  LayoutDashboard,
  Network,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Table2,
  Ticket,
} from 'lucide-react'

import type { MenuNode } from '@/domain/entities/auth'
import { useNavigationContext } from '@/presentation/hooks/navigation-context'
import { cn } from '@/presentation/lib/utils'

/** Peta ikon menu (nama ikon di MenuModule DB → komponen lucide). */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  'layout-dashboard': LayoutDashboard,
  assets: Boxes,
  boxes: Boxes,
  licenses: FileSpreadsheet,
  tickets: Ticket,
  ticket: Ticket,
  network: Network,
  server: Server,
  studio: FolderTree,
  'table-2': Table2,
  files: Globe,
  folder: Folder,
  security: ShieldCheck,
  shield: Shield,
  activity: Activity,
  container: Container,
  'bell-ring': BellRing,
  'key-round': KeyRound,
  settings: Settings,
}

function MenuLink({ node, depth }: { node: MenuNode; depth: number }) {
  const pathname = usePathname()
  const active = node.route_path !== null && pathname.startsWith(node.route_path)
  const Icon = (node.icon && ICONS[node.icon]) || Boxes
  return (
    <Link
      href={node.route_path ?? '#'}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{node.label}</span>
    </Link>
  )
}

function MenuBranch({ node, depth }: { node: MenuNode; depth: number }) {
  if (node.children.length === 0) {
    if (node.route_path === null) return null
    return <MenuLink node={node} depth={depth} />
  }
  return (
    <div className="space-y-0.5">
      <div
        className="flex items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        <ChevronRight className="h-3 w-3" />
        {node.label}
      </div>
      {node.children.map((child) => (
        <MenuBranch key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function AppSidebar() {
  const { navigation } = useNavigationContext()
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-background md:flex md:flex-col">
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <MenuLink
          node={{
            id: 'static-dashboard',
            code: 'dashboard',
            label: 'Dashboard',
            route_path: '/dashboard',
            icon: 'dashboard',
            sort_order: 0,
            can_create: false,
            can_update: false,
            can_delete: false,
            children: [],
          }}
          depth={0}
        />
        <MenuLink
          node={{
            id: 'static-security',
            code: 'profile-security',
            label: 'Profil Keamanan',
            route_path: '/profile/security',
            icon: 'security',
            sort_order: 0,
            can_create: false,
            can_update: false,
            can_delete: false,
            children: [],
          }}
          depth={0}
        />
        {navigation.menus.map((node) => (
          <MenuBranch key={node.id} node={node} depth={0} />
        ))}
      </nav>
    </aside>
  )
}
