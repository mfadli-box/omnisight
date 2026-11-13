'use client'

/** Menu user (header): profil keamanan + logout via BFF proxy. */

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { LogOut, ShieldCheck, User } from 'lucide-react'

import { clientGateways } from '@/infrastructure/api/gateways'
import { Button } from '@/presentation/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/presentation/components/ui/popover'

export function UserMenu({ displayName }: { displayName: string }) {
  const router = useRouter()
  const gateway = clientGateways().auth

  async function handleLogout() {
    try {
      await gateway.logout()
      toast.success('Anda telah keluar')
      router.replace('/login')
      router.refresh()
    } catch {
      toast.error('Logout gagal — coba lagi')
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <User className="h-4 w-4" />
          <span className="max-w-[160px] truncate">{displayName}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex flex-col gap-1">
          <Link
            href="/profile/security"
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <ShieldCheck className="h-4 w-4" /> Profil Keamanan
          </Link>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
