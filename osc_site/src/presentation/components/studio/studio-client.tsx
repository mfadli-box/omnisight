'use client'

/** Dynamic Collection Explorer (Studio) — metadata DDL runtime + item JSONB. */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCcw } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import type { CollectionMeta, DynamicItem, FieldMeta } from '@/domain/entities/studio'
import type { IStudioGateway } from '@/domain/gateways/studio'
import { collectionFormSchema } from '@/infrastructure/validation/forms'
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
import { Skeleton } from '@/presentation/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table'

export function StudioClient({ gateway }: { gateway: IStudioGateway }) {
  const [collections, setCollections] = useState<CollectionMeta[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldMeta[]>([])
  const [items, setItems] = useState<DynamicItem[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    gateway
      .listCollections()
      .then((rows) => {
        if (!cancelled) setCollections(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCollections([])
          toast.error(err instanceof ApiClientError ? err.message : 'Gagal memuat koleksi')
        }
      })
    return () => {
      cancelled = true
    }
  }, [gateway, reloadKey])

  useEffect(() => {
    if (selected === null) return
    let cancelled = false
    Promise.all([gateway.listFields(selected), gateway.listItems(selected, 100)])
      .then(([f, i]) => {
        if (!cancelled) {
          setFields(f)
          setItems(i)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFields([])
          setItems([])
          toast.error(err instanceof ApiClientError ? err.message : 'Gagal memuat item')
        }
      })
    return () => {
      cancelled = true
    }
  }, [gateway, selected, reloadKey])

  const columns = fields.map((f) => f.field)

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dynamic Collection Explorer</h1>
          <p className="text-sm text-muted-foreground">
            Metadata Studio + item JSONB `dyn_*` — identifier tervalidasi, filter AST
            terparameterisasi (anti SQLi) di upstream.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Refresh">
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <CreateCollectionDialog gateway={gateway} onCreated={reload} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {collections === null && <Skeleton className="h-8 w-64" />}
        {(collections ?? []).map((collection) => (
          <button
            key={collection.collection}
            type="button"
            onClick={() => setSelected(collection.collection)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              selected === collection.collection
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            {collection.collection}
          </button>
        ))}
        {collections !== null && collections.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada koleksi — buat satu.</p>
        )}
      </div>

      {selected !== null && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selected}</Badge>
            {fields.map((field) => (
              <Badge key={field.field} variant="outline" className="font-mono text-xs">
                {field.field}
                {field.is_required ? ' *' : ''}
              </Badge>
            ))}
            <CreateItemDialog
              gateway={gateway}
              collection={selected}
              fields={columns}
              onCreated={reload}
            />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column} className="font-mono text-xs">
                      {column}
                    </TableHead>
                  ))}
                  <TableHead>created_at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length + 1} className="py-6 text-center text-muted-foreground">
                      Belum ada item.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((item) => (
                  <TableRow key={item.id}>
                    {columns.map((column) => (
                      <TableCell key={column} className="max-w-[220px] truncate text-xs">
                        {String(item.data[column] ?? '-')}
                      </TableCell>
                    ))}
                    <TableCell className="text-xs">{item.created_at || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

function CreateCollectionDialog({
  gateway,
  onCreated,
}: {
  gateway: IStudioGateway
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = collectionFormSchema.safeParse({ collection: name, note: note || undefined })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      await gateway.createCollection(parsed.data)
      toast.success(`Koleksi ${name} dibuat (DDL runtime dyn_${name})`)
      setOpen(false)
      setName('')
      setNote('')
      onCreated()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'CONFLICT'
          ? 'Koleksi sudah ada (409)'
          : error instanceof ApiClientError
            ? error.message
            : 'Gagal membuat koleksi',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Koleksi Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Koleksi Dinamis Baru</DialogTitle>
          <DialogDescription>
            {'Nama identifier: ^[a-z][a-z0-9_]{0,49}$ — upstream menjalankan DDL runtime'}
            {' CREATE TABLE dyn_'}
            {'<collection> di dalam transaksi.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Nama koleksi *</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="inventory_extra" required maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-note">Catatan</Label>
            <Input id="c-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? 'Membuat…' : 'Buat'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateItemDialog({
  gateway,
  collection,
  fields,
  onCreated,
}: {
  gateway: IStudioGateway
  collection: string
  fields: string[]
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await gateway.createItem(collection, values)
      toast.success('Item dibuat')
      setOpen(false)
      setValues({})
      onCreated()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'VALIDATION_ERROR'
          ? 'Field tidak terdaftar di metadata atau nilai tidak valid'
          : error instanceof ApiClientError
            ? error.message
            : 'Gagal membuat item',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Item Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Item Baru — {collection}</DialogTitle>
          <DialogDescription>
            Hanya field terdaftar di metadata yang diterima upstream (sisanya 400).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">Koleksi belum memiliki field.</p>
          )}
          {fields.map((field) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`f-${field}`}>{field}</Label>
              <Input
                id={`f-${field}`}
                value={values[field] ?? ''}
                onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                maxLength={500}
              />
            </div>
          ))}
          <DialogFooter>
            <Button type="submit" disabled={busy || fields.length === 0}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
