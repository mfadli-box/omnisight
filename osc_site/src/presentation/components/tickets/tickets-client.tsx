'use client'

/** Helpdesk Tickets (ITIL) — daftar + create (kode TK-NNNNNN app-generated). */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import { TICKET_PRIORITIES, TICKET_TYPES, type TicketRow } from '@/domain/entities/itam'
import type { IItamGateway } from '@/domain/gateways/itam'
import { ticketCreateFormSchema, type TicketCreateFormValues } from '@/infrastructure/validation/forms'
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

const PRIORITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'warning' | 'outline'> = {
  VERY_LOW: 'outline',
  LOW: 'secondary',
  MEDIUM: 'secondary',
  HIGH: 'warning',
  VERY_HIGH: 'destructive',
}

export function TicketsClient({ gateway }: { gateway: IItamGateway }) {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    gateway
      .listTickets({ limit: 100 })
      .then((rows) => {
        if (!cancelled) setTickets(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTickets([])
          toast.error(err instanceof ApiClientError ? err.message : 'Gagal memuat tiket')
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
          <h1 className="text-xl font-semibold tracking-tight">Helpdesk Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Kode tiket `TK-NNNNNN` di-generate upstream per company (`UNIQUE(company_id, code)`).
          </p>
        </div>
        <CreateTicketDialog gateway={gateway} onCreated={reload} />
      </div>

      {tickets === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Judul</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Prioritas</TableHead>
                <TableHead>Dibuat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada tiket.
                  </TableCell>
                </TableRow>
              )}
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-mono text-xs">{ticket.code}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{ticket.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ticket.ticket_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'outline'}>
                      {ticket.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{ticket.created_at || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function CreateTicketDialog({
  gateway,
  onCreated,
}: {
  gateway: IItamGateway
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<TicketCreateFormValues>({
    title: '',
    ticket_type: 'INCIDENT',
    priority: 'MEDIUM',
  })

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = ticketCreateFormSchema.safeParse(form)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      await gateway.createTicket({
        ...parsed.data,
        description: parsed.data.description || undefined,
        due_at: parsed.data.due_at || undefined,
      })
      toast.success('Tiket dibuat')
      setOpen(false)
      onCreated()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Gagal membuat tiket')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Tiket Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tiket Baru</DialogTitle>
          <DialogDescription>
            Kode TK-NNNNNN dibuat upstream melalui nomor sequence per company.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Judul *</Label>
            <Input id="t-title" value={form.title} maxLength={300} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipe</Label>
              <Select value={form.ticket_type} onValueChange={(v) => setForm({ ...form, ticket_type: v as TicketCreateFormValues['ticket_type'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioritas</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TicketCreateFormValues['priority'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Deskripsi</Label>
            <Textarea id="t-desc" value={form.description ?? ''} maxLength={5000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
