'use client'

/**
 * Docker Stack & Container Studio (route menu `infra.compose`).
 *  - Editor YAML `compose.yaml` (Textarea monospace; validasi struktural
 *    otoritatif tetap di osc_rest `application/infra_validate.rs`).
 *  - Dispatch Deploy(up) / Pull / Restart / Stop(down) → 202 antrean,
 *    dieksekusi agent `infra_control` (API tidak pernah memanggil shell).
 *  - Viewer live logs SSE per stack (scope docker_stack).
 * Semua tombol gated privilege menu (`infra.compose` can_create/update/delete).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCcw, Rocket } from 'lucide-react'

import type { ComposeStack, DockerHostRef, StackCommand } from '@/domain/entities/infra'
import type { IInfraGateway } from '@/domain/gateways/infra'
import { ApiClientError } from '@/domain/errors'
import {
  COMPOSE_TEMPLATE,
  DISPATCH_COMMANDS,
  DISPATCH_LABELS,
  DRIFT_VARIANT,
  formatDateTime,
  menuPrivilege,
  type MenuPrivilege,
} from '@/application/usecases/infra'
import { stackCreateFormSchema, stackUpdateFormSchema } from '@/infrastructure/validation/forms'
import { Badge } from '@/presentation/components/ui/badge'
import { Button } from '@/presentation/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card'
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
import { Skeleton } from '@/presentation/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs'
import { Textarea } from '@/presentation/components/ui/textarea'
import { LogStreamViewer } from '@/presentation/components/infra/log-stream-viewer'
import { useNavigationContext } from '@/presentation/hooks/navigation-context'

export function DockerStudioClient({ gateway }: { gateway: IInfraGateway }) {
  const { navigation } = useNavigationContext()
  const privilege: MenuPrivilege = useMemo(
    () => menuPrivilege(navigation.menus, 'infra.compose'),
    [navigation.menus],
  )

  const [stacks, setStacks] = useState<ComposeStack[] | null>(null)
  const [hosts, setHosts] = useState<DockerHostRef[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([gateway.listStacks(), gateway.listDockerHosts()]).then(([s, h]) => {
      if (cancelled) return
      if (s.status === 'fulfilled') setStacks(s.value)
      else toast.error('Gagal memuat daftar stack')
      if (h.status === 'fulfilled') setHosts(h.value)
    })
    return () => {
      cancelled = true
    }
  }, [gateway, reloadKey])

  const selected = (stacks ?? []).find((s) => s.id === selectedId) ?? null
  const logOptions = (stacks ?? []).map((s) => ({ id: s.id, label: s.name }))

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Docker Stack & Container Studio</h1>
          <p className="text-sm text-muted-foreground">
            Editor `compose.yaml` + dispatch antrean (agent `infra_control` mengeksekusi —
            zero command-injection di API).
          </p>
        </div>
        <div className="flex gap-2">
          {privilege.can_create && <CreateStackDialog gateway={gateway} hosts={hosts} onCreated={reload} />}
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Refresh">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="stacks">
        <TabsList>
          <TabsTrigger value="stacks">Stacks</TabsTrigger>
          <TabsTrigger value="logs">Live Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="stacks" className="space-y-3">
          {stacks === null ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Working Dir</TableHead>
                    <TableHead>Drift</TableHead>
                    <TableHead>Last Deployed</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stacks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        Belum ada stack compose.
                      </TableCell>
                    </TableRow>
                  )}
                  {stacks.map((stack) => (
                    <TableRow
                      key={stack.id}
                      className={stack.id === selectedId ? 'bg-accent/50' : ''}
                    >
                      <TableCell className="font-medium">{stack.name}</TableCell>
                      <TableCell className="text-xs">{stack.host_name}</TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs">
                        {stack.working_dir}
                      </TableCell>
                      <TableCell>
                        <Badge variant={DRIFT_VARIANT[stack.drift_status] ?? 'secondary'}>
                          {stack.drift_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{formatDateTime(stack.last_deployed_at)}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => setSelectedId(stack.id)}>
                          <Rocket className="h-4 w-4" /> Kelola
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {selected && (
            <StackEditor gateway={gateway} stack={selected} privilege={privilege} onChanged={reload} />
          )}
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Logs (SSE)</CardTitle>
              <CardDescription>
                Stream `GET /infra/logs/stream` — baris dipush agent via HMAC `/agents/logs`.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogStreamViewer scope="docker_stack" options={logOptions} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StackEditor({
  gateway,
  stack,
  privilege,
  onChanged,
}: {
  gateway: IInfraGateway
  stack: ComposeStack
  privilege: MenuPrivilege
  onChanged: () => void
}) {
  const [compose, setCompose] = useState(stack.compose_content ?? '')
  const [env, setEnv] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // compose_content hanya ada di detail (GET) — muat saat panel dibuka.
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    gateway
      .getStack(stack.id)
      .then((detail) => {
        if (cancelled) return
        setCompose(detail.compose_content ?? '')
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setCompose(stack.compose_content ?? '')
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [gateway, stack.id, stack.compose_content])

  async function run(action: 'save' | StackCommand | 'delete') {
    setBusy(action)
    try {
      if (action === 'save') {
        if (!privilege.can_update) throw new Error('Tanpa privilege update')
        const parsed = stackUpdateFormSchema.safeParse({
          compose_content: compose,
          env: env.length > 0 ? env : undefined,
        })
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
          return
        }
        await gateway.updateStack(stack.id, {
          compose_content: parsed.data.compose_content,
          ...(parsed.data.env !== undefined ? { env: parsed.data.env } : {}),
        })
        toast.success('Stack tersimpan (snapshot lama dibackup ke RustFS)')
      } else if (action === 'delete') {
        if (!privilege.can_delete) throw new Error('Tanpa privilege delete')
        await gateway.deleteStack(stack.id)
        toast.success('Stack dihapus (soft delete)')
        onChanged()
        return
      } else {
        if (!privilege.can_update) throw new Error('Tanpa privilege update')
        const queued = await gateway.dispatchStack(stack.id, action)
        toast.success(`Dispatch ${queued.command} masuk antrean (${queued.dispatch_ref.slice(0, 8)}…)`)
      }
      onChanged()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : `Gagal: ${String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null || !loaded

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {stack.name} <span className="text-xs text-muted-foreground">({stack.working_dir})</span>
        </CardTitle>
        <CardDescription>
          {stack.last_error ? (
            <span className="text-destructive">Last error: {stack.last_error}</span>
          ) : (
            'Update otomatis membackup snapshot compose ke RustFS sebelum overwrite.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="st-compose">compose.yaml</Label>
          <Textarea
            id="st-compose"
            className="min-h-64 font-mono text-xs"
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-env">Env override (plaintext — dienkripsi Envelope AES-256-GCM di server)</Label>
          <Input
            id="st-env"
            type="password"
            className="font-mono text-xs"
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            placeholder="KEY=value (kosong = tidak diubah)"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {privilege.can_update && (
            <Button size="sm" disabled={disabled} onClick={() => void run('save')}>
              {busy === 'save' ? 'Menyimpan…' : 'Simpan Compose'}
            </Button>
          )}
          {privilege.can_update &&
            DISPATCH_COMMANDS.map((cmd) => (
              <Button
                key={cmd}
                size="sm"
                variant={cmd === 'down' ? 'destructive' : 'outline'}
                disabled={disabled}
                onClick={() => void run(cmd)}
              >
                {busy === cmd ? 'Mengirim…' : DISPATCH_LABELS[cmd]}
              </Button>
            ))}
          {privilege.can_delete && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void run('delete')}>
              {busy === 'delete' ? 'Menghapus…' : 'Hapus'}
            </Button>
          )}
          {!privilege.can_update && !privilege.can_delete && (
            <p className="text-xs text-muted-foreground">
              Menu `infra.compose` tanpa privilege update/delete — mode lihat saja.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CreateStackDialog({
  gateway,
  hosts,
  onCreated,
}: {
  gateway: IInfraGateway
  hosts: DockerHostRef[]
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hostId, setHostId] = useState('')
  const [name, setName] = useState('')
  const [workingDir, setWorkingDir] = useState('')
  const [compose, setCompose] = useState(COMPOSE_TEMPLATE)
  const [env, setEnv] = useState('')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = stackCreateFormSchema.safeParse({
      docker_host_id: hostId,
      name,
      working_dir: workingDir,
      compose_content: compose,
      env: env.length > 0 ? env : undefined,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      await gateway.createStack({
        docker_host_id: parsed.data.docker_host_id,
        name: parsed.data.name,
        working_dir: parsed.data.working_dir,
        compose_content: parsed.data.compose_content,
        env: parsed.data.env,
      })
      toast.success('Stack dibuat')
      setOpen(false)
      setName('')
      setWorkingDir('')
      setEnv('')
      onCreated()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Gagal membuat stack')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Stack Baru
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose Stack Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Docker Host *</Label>
              <Select value={hostId} onValueChange={setHostId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih host" />
                </SelectTrigger>
                <SelectContent>
                  {hosts.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-name">Nama *</Label>
              <Input
                id="cs-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="monitoring"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-dir">Working Dir (absolut, tanpa `..` / `~` / `\`) *</Label>
            <Input
              id="cs-dir"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="/opt/stacks/monitoring"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-compose">compose.yaml *</Label>
            <Textarea
              id="cs-compose"
              className="min-h-48 font-mono text-xs"
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-env">Env override (dienkripsi di server)</Label>
            <Input
              id="cs-env"
              type="password"
              className="font-mono text-xs"
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || hosts.length === 0}>
              {busy ? 'Menyimpan…' : 'Buat Stack'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
