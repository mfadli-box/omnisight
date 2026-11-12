import Link from 'next/link'
import { Boxes, FileSpreadsheet, FolderTree, Globe, Network, Ticket } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/presentation/components/ui/card'

/** Dashboard ringkas — pintu masuk modul Wave 1. */
export default function DashboardPage() {
  const modules = [
    { href: '/assets', label: 'Manajemen Aset', desc: 'ITAM, Check-Out/Check-In, Import/Export Excel', icon: Boxes },
    { href: '/licenses', label: 'Software Licenses', desc: 'Seat usage, kunci tidak diekspos', icon: FileSpreadsheet },
    { href: '/tickets', label: 'Helpdesk Tickets', desc: 'ITIL, kode TK-NNNNNN per company', icon: Ticket },
    { href: '/network', label: 'DCIM / IPAM', desc: 'Racks, prefixes (overlap check), addresses', icon: Network },
    { href: '/studio', label: 'Dynamic Collections', desc: 'Studio explorer, filter AST', icon: FolderTree },
    { href: '/files', label: 'File RustFS', desc: 'Upload 25 MB, presigned URL TTL 300 s', icon: Globe },
  ]
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Konteks tenant mengikuti company aktif (switcher di header) — semua query
          tenant-guarded server-side.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Link key={module.href} href={module.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <module.icon className="h-4 w-4" /> {module.label}
                </CardTitle>
                <CardDescription>{module.desc}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
