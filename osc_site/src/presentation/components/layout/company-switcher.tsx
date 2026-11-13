'use client'

/**
 * Company Switcher — Popover + Command di header sidebar.
 * Memanggil `POST /api/proxy/v1/auth/switch-company` (proxy merotasi cookie
 * sesi dengan JWT klaim company baru), lalu `router.refresh()` agar seluruh
 * Server Component me-render ulang dengan konteks tenant baru.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, Check, ChevronsUpDown, Globe } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import type { CompanyAccess } from '@/domain/entities/auth'
import { clientGateways } from '@/infrastructure/api/gateways'
import { useNavigationContext } from '@/presentation/hooks/navigation-context'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/presentation/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/presentation/components/ui/popover'
import { Button } from '@/presentation/components/ui/button'

export function CompanySwitcher() {
  const { navigation } = useNavigationContext()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const gateway = clientGateways().auth

  const active =
    navigation.companies.find((c: CompanyAccess) => c.is_active_company) ?? null

  async function switchCompany(company: CompanyAccess | null) {
    setOpen(false)
    try {
      // company null → kembali ke "Local / Global" (default access).
      const companyId = company?.id ?? ''
      if (companyId === '') {
        toast.info('Local / Global dipilih', {
          description: 'Switch ke default access memerlukan company_id UUID — gunakan daftar company Anda.',
        })
        return
      }
      await gateway.switchCompany(companyId)
      toast.success(`Company aktif: ${company?.name ?? '-'}`)
      startTransition(() => router.refresh())
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Gagal mengganti company'
      toast.error(message)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
          disabled={pending}
        >
          <span className="flex items-center gap-2 truncate">
            {active ? (
              <Building2 className="h-4 w-4 shrink-0" />
            ) : (
              <Globe className="h-4 w-4 shrink-0" />
            )}
            {active ? `${active.name} (${active.code})` : 'Local / Global'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0">
        <Command>
          <CommandInput placeholder="Cari company…" />
          <CommandList>
            <CommandEmpty>Tidak ada company.</CommandEmpty>
            <CommandGroup heading="Company">
              {navigation.companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={`${company.name} ${company.code}`}
                  onSelect={() => void switchCompany(company)}
                >
                  <Check
                    className={`mr-1 h-4 w-4 ${company.is_active_company ? 'opacity-100' : 'opacity-0'}`}
                  />
                  <div className="flex flex-col">
                    <span>{company.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {company.code} · {company.role_name ?? 'tanpa role'}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
