'use client'

/**
 * Modul Manajemen Aset (ITAM): tabel + create + Check-Out/Check-In Modal
 * (transaksi upstream FOR UPDATE + re-check; 409 = aset ter-assign).
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LogIn, LogOut, Plus } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import { ASSET_NODE_TYPES, ASSET_STATUSES, type Asset } from '@/domain/entities/itam'
import type { IItamGateway } from '@/domain/gateways/itam'
import { assetCreateFormSchema, checkoutFormSchema, type AssetCreateFormValues } from '@/infrastructure/validation/forms'
import { Badge } from '@/presentation/components/ui/badge'
import { Button } from '@/presentation/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/presentation/components/ui/dialog'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'
import { Skeleton } from '@/presentation/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table'
import { Textarea } from '@/presentation/components/ui/textarea'
import { ExcelExportButton } from '@/presentation/components/excel/export-button'
import { ExcelImportModal } from '@/presentation/components/excel/import-modal'

export function AssetsClient({ gateway }: { gateway: IItamGateway }) {
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    gateway
      .listAssets({ limit: 100 })
      .then((rows) => {
        if (!cancelled) setAssets(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAssets([])
          toast.error(err instanceof ApiClientError ? err.message : 'Gagal memuat aset')
        }
      })
    return () => {
      cancelled = true
    }
  }, [gateway, reloadKey])

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Manajemen Aset</h1>
          <p className="text-sm text-muted-foreground">
            ITAM tenant-scoped — model &amp; status label tervalidasi anti-IDOR di upstream.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExcelExportButton />
          <ExcelImportModal onImported={reload} />
          <CreateAssetDialog gateway={gateway} onCreated={reload} />
        </div>
      </div>

      {assets === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead>Mgmt IP</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Belum ada aset — buka menu Import Excel atau buat manual.
                  </TableCell>
                </TableRow>
              )}
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-mono text-xs">{asset.asset_tag}</TableCell>
                  <TableCell>{asset.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{asset.node_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={asset.status === 'ACTIVE' ? 'success' : 'outline'}>
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{asset.hostname ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{asset.mgmt_ip ?? '-'}</TableCell>
                  <TableCell>
                    {asset.assigned_to_user_id === null ? (
                      <CheckOutDialog asset={asset} gateway={gateway} onDone={reload} />
                    ) : (
                      <CheckInDialog asset={asset} gateway={gateway} onDone={reload} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function CreateAssetDialog({
  gateway,
  onCreated,
}: {
  gateway: IItamGateway
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<AssetCreateFormValues>({
    name: '',
    asset_tag: '',
    node_type: 'HOST',
    status: 'ACTIVE',
  })

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = assetCreateFormSchema.safeParse(form)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      await gateway.createAsset({
        ...parsed.data,
        hostname: parsed.data.hostname || undefined,
        mgmt_ip: parsed.data.mgmt_ip || undefined,
        serial_number: parsed.data.serial_number || undefined,
        asset_model_id: parsed.data.asset_model_id || undefined,
        status_label_id: parsed.data.status_label_id || undefined,
      })
      toast.success('Aset dibuat')
      setOpen(false)
      onCreated()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Gagal membuat aset')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Aset Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aset Baru</DialogTitle>
          <DialogDescription>
            `asset_model_id` &amp; `status_label_id` opsional — upstream memakai default
            per-company (Generic Model / Deployable).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="a-name">Nama *</Label>
            <Input id="a-name" value={form.name} maxLength={150} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-tag">Asset Tag *</Label>
            <Input id="a-tag" value={form.asset_tag} maxLength={100} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>Tipe Node</Label>
            <Select value={form.node_type} onValueChange={(v) => setForm({ ...form, node_type: v as AssetCreateFormValues['node_type'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSET_NODE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AssetCreateFormValues['status'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-host">Hostname</Label>
            <Input id="a-host" value={form.hostname ?? ''} maxLength={255} onChange={(e) => setForm({ ...form, hostname: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-ip">Mgmt IP</Label>
            <Input id="a-ip" value={form.mgmt_ip ?? ''} onChange={(e) => setForm({ ...form, mgmt_ip: e.target.value })} placeholder="10.10.0.10" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="a-serial">Serial Number</Label>
            <Input id="a-serial" value={form.serial_number ?? ''} maxLength={255} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="a-notes">Catatan</Label>
            <Textarea id="a-notes" value={form.notes ?? ''} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CheckOutDialog({
  asset,
  gateway,
  onDone,
}: {
  asset: Asset
  gateway: IItamGateway
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [targetUserId, setTargetUserId] = useState('')
  const [expected, setExpected] = useState('')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = checkoutFormSchema.safeParse({
      target_user_id: targetUserId || undefined,
      expected_checkin_at: expected || undefined,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      await gateway.checkoutAsset(asset.id, {
        target_user_id: parsed.data.target_user_id || undefined,
        expected_checkin_at: parsed.data.expected_checkin_at || undefined,
      })
      toast.success(`Aset ${asset.asset_tag} di-check-out`)
      setOpen(false)
      onDone()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'CONFLICT'
          ? 'Aset sudah ter-assign (409)'
          : error instanceof ApiClientError
            ? error.message
            : 'Check-out gagal',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LogOut className="h-3.5 w-3.5" /> Check-Out
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check-Out {asset.asset_tag}</DialogTitle>
          <DialogDescription>
            Upstream memakai transaksi `SELECT … FOR UPDATE` + re-check: aset non-DEPLOYABLE
            ditolak 400, aset ter-assign ditolak 409. Log ditulis ke `asset_checkout_logs`.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="co-user">Target User ID (UUID, opsional)</Label>
            <Input id="co-user" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="UUID user penerima" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-date">Expected check-in (opsional)</Label>
            <Input id="co-date" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? 'Memproses…' : 'Check-Out'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CheckInDialog({
  asset,
  gateway,
  onDone,
}: {
  asset: Asset
  gateway: IItamGateway
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function onCheckIn() {
    setBusy(true)
    try {
      await gateway.checkinAsset(asset.id)
      toast.success(`Aset ${asset.asset_tag} di-check-in`)
      onDone()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.status === 400
          ? 'Aset tidak sedang assigned (400)'
          : error instanceof ApiClientError
            ? error.message
            : 'Check-in gagal',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => void onCheckIn()} disabled={busy}>
      <LogIn className="h-3.5 w-3.5" /> Check-In
    </Button>
  )
}
