'use client'

/** DCIM/IPAM Explorer — Racks, Prefixes (CIDR + overlap 409), Addresses. */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCcw } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import { PREFIX_STATUSES, type AddressRow, type PrefixRow, type RackRow } from '@/domain/entities/net'
import type { INetGateway } from '@/domain/gateways/net'
import { addressFormSchema, prefixFormSchema } from '@/infrastructure/validation/forms'
import { Badge } from '@/presentation/components/ui/badge'
import { Button } from '@/presentation/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/presentation/components/ui/dialog'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { Progress } from '@/presentation/components/ui/progress'
import { Skeleton } from '@/presentation/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs'

export function NetworkClient({ gateway }: { gateway: INetGateway }) {
  const [racks, setRacks] = useState<RackRow[] | null>(null)
  const [prefixes, setPrefixes] = useState<PrefixRow[] | null>(null)
  const [addresses, setAddresses] = useState<AddressRow[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([gateway.listRacks(), gateway.listPrefixes(), gateway.listAddresses()]).then(
      ([r, p, a]) => {
        if (cancelled) return
        setRacks(r.status === 'fulfilled' ? r.value : [])
        setPrefixes(p.status === 'fulfilled' ? p.value : [])
        setAddresses(a.status === 'fulfilled' ? a.value : [])
        for (const result of [r, p, a]) {
          if (result.status === 'rejected') {
            toast.error(result.reason instanceof ApiClientError ? result.reason.message : 'Gagal memuat data jaringan')
          }
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [gateway, reloadKey])

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">DCIM / IPAM Explorer</h1>
          <p className="text-sm text-muted-foreground">
            Tenant-guarded per company aktif — prefix overlap divalidasi app-level (409).
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={reload} aria-label="Refresh">
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="racks">
        <TabsList>
          <TabsTrigger value="racks">Racks</TabsTrigger>
          <TabsTrigger value="prefixes">Prefixes</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
        </TabsList>

        <TabsContent value="racks">
          {racks === null ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Okupansi Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {racks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                        Belum ada rack.
                      </TableCell>
                    </TableRow>
                  )}
                  {racks.map((rack) => (
                    <TableRow key={rack.id}>
                      <TableCell className="font-medium">{rack.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={rack.u_total > 0 ? (rack.u_used / rack.u_total) * 100 : 0} className="w-40" />
                          <span className="text-xs text-muted-foreground">
                            {rack.u_used}/{rack.u_total} U
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="prefixes" className="space-y-3">
          <div className="flex justify-end">
            <CreatePrefixDialog gateway={gateway} onCreated={reload} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CIDR</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pool</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(prefixes ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      Belum ada prefix.
                    </TableCell>
                  </TableRow>
                )}
                {(prefixes ?? []).map((prefix) => (
                  <TableRow key={prefix.id}>
                    <TableCell className="font-mono text-xs">{prefix.prefix}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{prefix.status}</Badge>
                    </TableCell>
                    <TableCell>{prefix.is_pool ? 'Ya' : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="addresses" className="space-y-3">
          <div className="flex justify-end">
            <CreateAddressDialog gateway={gateway} onCreated={reload} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>DNS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(addresses ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Belum ada alamat IP.
                    </TableCell>
                  </TableRow>
                )}
                {(addresses ?? []).map((address) => (
                  <TableRow key={address.id}>
                    <TableCell className="font-mono text-xs">{address.address}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{address.status}</Badge>
                    </TableCell>
                    <TableCell>{address.is_gateway ? 'Ya' : '-'}</TableCell>
                    <TableCell className="text-xs">{address.dns_name ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CreatePrefixDialog({ gateway, onCreated }: { gateway: INetGateway; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [isPool, setIsPool] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = prefixFormSchema.safeParse({ prefix, status: 'ACTIVE', is_pool: isPool })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      await gateway.createPrefix(parsed.data)
      toast.success('Prefix dibuat')
      setOpen(false)
      setPrefix('')
      onCreated()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'CONFLICT'
          ? 'Prefix overlap dengan prefix lain (409)'
          : error instanceof ApiClientError
            ? error.message
            : 'Gagal membuat prefix',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Prefix Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prefix IP Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-cidr">CIDR IPv4 *</Label>
            <Input id="p-cidr" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="10.10.0.0/24" required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPool} onChange={(e) => setIsPool(e.target.checked)} />
            Tandai sebagai pool
          </label>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateAddressDialog({ gateway, onCreated }: { gateway: INetGateway; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ address: '', dns_name: '' })

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = addressFormSchema.safeParse({ address: form.address, status: 'ACTIVE', dns_name: form.dns_name || undefined })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      await gateway.createAddress(parsed.data)
      toast.success('Alamat IP dibuat')
      setOpen(false)
      setForm({ address: '', dns_name: '' })
      onCreated()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Gagal membuat alamat')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Address Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alamat IP Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ad-addr">Address *</Label>
            <Input id="ad-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="10.10.0.10" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-dns">DNS Name</Label>
            <Input id="ad-dns" value={form.dns_name} onChange={(e) => setForm({ ...form, dns_name: e.target.value })} maxLength={255} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
