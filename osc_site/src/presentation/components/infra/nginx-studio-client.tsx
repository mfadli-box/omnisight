'use client'

/**
 * Nginx Reverse Proxy Studio (route menu `infra.nginx`).
 *  - Manajemen Virtual Host (config editor monospace + SSL path).
 *  - Status SSL certificate expiry (diekstrak dari heartbeat monitor
 *    HTTPS/KEYWORD via rollup status page publik; agent network_poller).
 *  - Tombol Test & Reload → dispatch `test_reload` (agent `nginx -t && reload`).
 * Gated privilege menu `infra.nginx` (can_create/update/delete).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCcw, ShieldCheck } from 'lucide-react'

import type { NginxNodeRef, NginxVhost } from '@/domain/entities/infra'
import type { IInfraGateway } from '@/domain/gateways/infra'
import { ApiClientError } from '@/domain/errors'
import {
  VHOST_STATUS_VARIANT,
  VHOST_TEMPLATE,
  formatDateTime,
  menuPrivilege,
  sslExpiryRows,
  type MenuPrivilege,
} from '@/application/usecases/infra'
import { vhostCreateFormSchema, vhostUpdateFormSchema } from '@/infrastructure/validation/forms'
import { Alert, AlertDescription, AlertTitle } from '@/presentation/components/ui/alert'
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

interface SslRow {
  monitorId: string
  name: string
  expiryText: string
  daysRemaining: number | null
  state: string
}

export function NginxStudioClient({ gateway }: { gateway: IInfraGateway }) {
  const { navigation } = useNavigationContext()
  const privilege: MenuPrivilege = useMemo(
    () => menuPrivilege(navigation.menus, 'infra.nginx'),
    [navigation.menus],
  )

  const [vhosts, setVhosts] = useState<NginxVhost[] | null>(null)
  const [nodes, setNodes] = useState<NginxNodeRef[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sslRows, setSslRows] = useState<SslRow[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([gateway.listVhosts(), gateway.listNginxNodes(), loadSslRows(gateway)]).then(
      ([v, n, ssl]) => {
        if (cancelled) return
        if (v.status === 'fulfilled') setVhosts(v.value)
        else toast.error('Gagal memuat daftar vhost')
        if (n.status === 'fulfilled') setNodes(n.value)
        setSslRows(ssl.status === 'fulfilled' ? ssl.value : null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [gateway, reloadKey])

  const selected = (vhosts ?? []).find((v) => v.id === selectedId) ?? null
  const logOptions = (vhosts ?? []).map((v) => ({ id: v.id, label: `${v.server_name}:${v.listen_port}` }))

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Nginx Reverse Proxy Studio</h1>
          <p className="text-sm text-muted-foreground">
            Virtual Host config + pipeline validasi→backup→`nginx -t && reload` oleh agent.
          </p>
        </div>
        <div className="flex gap-2">
          {privilege.can_create && <CreateVhostDialog gateway={gateway} nodes={nodes} onCreated={reload} />}
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Refresh">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* SSL certificate expiry (sumber: monitor HTTPS via status page rollup) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> SSL Certificate Expiry
          </CardTitle>
          <CardDescription>
            Masa berlaku sertifikat dari heartbeat monitor HTTPS/KEYWORD
            (butuh privilege menu Uptime; kosong bila tidak tersedia).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sslRows === null || sslRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada data expiry sertifikat.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sslRows.map((row) => (
                <Badge
                  key={row.monitorId}
                  variant={
                    row.state === 'EXPIRED'
                      ? 'destructive'
                      : row.state === 'WARNING'
                        ? 'warning'
                        : 'success'
                  }
                >
                  {row.name}: {row.expiryText.slice(0, 10)}
                  {row.daysRemaining !== null ? ` (${row.daysRemaining} hari)` : ''}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="vhosts">
        <TabsList>
          <TabsTrigger value="vhosts">Virtual Hosts</TabsTrigger>
          <TabsTrigger value="logs">Live Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="vhosts" className="space-y-3">
          {vhosts === null ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Server Name</TableHead>
                    <TableHead>Node</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SSL</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vhosts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                        Belum ada virtual host.
                      </TableCell>
                    </TableRow>
                  )}
                  {vhosts.map((vhost) => (
                    <TableRow key={vhost.id} className={vhost.id === selectedId ? 'bg-accent/50' : ''}>
                      <TableCell className="font-mono text-xs">{vhost.server_name}</TableCell>
                      <TableCell className="text-xs">{vhost.node_name}</TableCell>
                      <TableCell>{vhost.listen_port}</TableCell>
                      <TableCell>
                        <Badge variant={VHOST_STATUS_VARIANT[vhost.status] ?? 'secondary'}>
                          {vhost.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {vhost.ssl_cert_path ? (
                          <Badge variant="success">cert</Badge>
                        ) : (
                          <Badge variant="secondary">—</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{formatDateTime(vhost.applied_at)}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => setSelectedId(vhost.id)}>
                          Kelola
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {selected && (
            <VhostEditor gateway={gateway} vhost={selected} privilege={privilege} onChanged={reload} />
          )}
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Logs (SSE)</CardTitle>
              <CardDescription>
                Output compose/reload agent untuk scope `nginx_vhost`.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogStreamViewer scope="nginx_vhost" options={logOptions} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

async function loadSslRows(gateway: IInfraGateway): Promise<SslRow[]> {
  const pages = await gateway.listStatusPages()
  const published = pages.filter((p) => p.is_published)
  const results = await Promise.allSettled(published.map((p) => gateway.getPublicStatusPage(p.slug)))
  const rollups = results.flatMap((r) => (r.status === 'fulfilled' ? r.value.monitors : []))
  return sslExpiryRows(rollups).map((row) => ({
    monitorId: row.monitorId,
    name: row.name,
    expiryText: row.expiryText,
    daysRemaining: row.daysRemaining,
    state: row.state,
  }))
}

function VhostEditor({
  gateway,
  vhost,
  privilege,
  onChanged,
}: {
  gateway: IInfraGateway
  vhost: NginxVhost
  privilege: MenuPrivilege
  onChanged: () => void
}) {
  const [config, setConfig] = useState(vhost.config_content ?? '')
  const [sslCert, setSslCert] = useState(vhost.ssl_cert_path ?? '')
  const [sslKey, setSslKey] = useState(vhost.ssl_key_path ?? '')
  const [busy, setBusy] = useState<string | null>(null)

  async function run(action: 'save' | 'test_reload' | 'delete') {
    setBusy(action)
    try {
      if (action === 'save') {
        if (!privilege.can_update) throw new Error('Tanpa privilege update')
        const parsed = vhostUpdateFormSchema.safeParse({
          config_content: config,
          ssl_cert_path: sslCert.trim().length > 0 ? sslCert.trim() : undefined,
          ssl_key_path: sslKey.trim().length > 0 ? sslKey.trim() : undefined,
        })
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
          return
        }
        await gateway.updateVhost(vhost.id, {
          config_content: parsed.data.config_content,
          ...(parsed.data.ssl_cert_path !== undefined ? { ssl_cert_path: parsed.data.ssl_cert_path } : {}),
          ...(parsed.data.ssl_key_path !== undefined ? { ssl_key_path: parsed.data.ssl_key_path } : {}),
        })
        toast.success('Config tersimpan (status kembali DRAFT; config lama dibackup ke RustFS)')
      } else if (action === 'delete') {
        if (!privilege.can_delete) throw new Error('Tanpa privilege delete')
        await gateway.deleteVhost(vhost.id)
        toast.success('Virtual host dihapus (soft delete)')
        onChanged()
        return
      } else {
        if (!privilege.can_update) throw new Error('Tanpa privilege update')
        const queued = await gateway.dispatchVhost(vhost.id)
        toast.success(`Test & Reload masuk antrean (${queued.dispatch_ref.slice(0, 8)}…)`)
      }
      onChanged()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : `Gagal: ${String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {vhost.server_name}
          <span className="text-xs text-muted-foreground"> :{vhost.listen_port}</span>
        </CardTitle>
        <CardDescription>
          {vhost.last_error ? (
            <span className="text-destructive">Last error: {vhost.last_error}</span>
          ) : (
            `Validated: ${formatDateTime(vhost.validated_at)} — Agent menjalankan \`nginx -t\` lalu reload.`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="vh-config">config_content (server &#123;…&#125;)</Label>
          <Textarea
            id="vh-config"
            className="min-h-56 font-mono text-xs"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vh-cert">SSL cert path</Label>
            <Input
              id="vh-cert"
              className="font-mono text-xs"
              value={sslCert}
              onChange={(e) => setSslCert(e.target.value)}
              placeholder="/etc/nginx/ssl/app.crt"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vh-key">SSL key path</Label>
            <Input
              id="vh-key"
              className="font-mono text-xs"
              value={sslKey}
              onChange={(e) => setSslKey(e.target.value)}
              placeholder="/etc/nginx/ssl/app.key"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {privilege.can_update && (
            <>
              <Button size="sm" disabled={busy !== null} onClick={() => void run('save')}>
                {busy === 'save' ? 'Menyimpan…' : 'Simpan Config'}
              </Button>
              <Button size="sm" disabled={busy !== null} onClick={() => void run('test_reload')}>
                {busy === 'test_reload' ? 'Mengirim…' : 'Test & Reload'}
              </Button>
            </>
          )}
          {privilege.can_delete && (
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run('delete')}>
              {busy === 'delete' ? 'Menghapus…' : 'Hapus'}
            </Button>
          )}
          {!privilege.can_update && !privilege.can_delete && (
            <p className="text-xs text-muted-foreground">
              Menu `infra.nginx` tanpa privilege update/delete — mode lihat saja.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CreateVhostDialog({
  gateway,
  nodes,
  onCreated,
}: {
  gateway: IInfraGateway
  nodes: NginxNodeRef[]
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [nodeId, setNodeId] = useState('')
  const [serverName, setServerName] = useState('')
  const [listenPort, setListenPort] = useState('80')
  const [config, setConfig] = useState(VHOST_TEMPLATE)
  const [sslCert, setSslCert] = useState('')
  const [sslKey, setSslKey] = useState('')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const port = Number.parseInt(listenPort, 10)
    const parsed = vhostCreateFormSchema.safeParse({
      nginx_node_id: nodeId,
      server_name: serverName,
      listen_port: Number.isNaN(port) ? -1 : port,
      config_content: config,
      ssl_cert_path: sslCert.trim().length > 0 ? sslCert.trim() : undefined,
      ssl_key_path: sslKey.trim().length > 0 ? sslKey.trim() : undefined,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      await gateway.createVhost({
        nginx_node_id: parsed.data.nginx_node_id,
        server_name: parsed.data.server_name,
        listen_port: parsed.data.listen_port,
        config_content: parsed.data.config_content,
        ssl_cert_path: parsed.data.ssl_cert_path,
        ssl_key_path: parsed.data.ssl_key_path,
      })
      toast.success('Virtual host dibuat')
      setOpen(false)
      setServerName('')
      setSslCert('')
      setSslKey('')
      onCreated()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'CONFLICT'
          ? 'Kombinasi (node, server_name, port) sudah ada (409)'
          : error instanceof ApiClientError
            ? error.message
            : 'Gagal membuat virtual host',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Virtual Host Baru
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Virtual Host Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nginx Node *</Label>
              <Select value={nodeId} onValueChange={setNodeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih node" />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-port">Listen Port</Label>
              <Input
                id="cv-port"
                type="number"
                min={1}
                max={65_535}
                value={listenPort}
                onChange={(e) => setListenPort(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cv-name">Server Name *</Label>
            <Input
              id="cv-name"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="app.example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cv-config">config_content *</Label>
            <Textarea
              id="cv-config"
              className="min-h-44 font-mono text-xs"
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cv-cert">SSL cert path</Label>
              <Input
                id="cv-cert"
                className="font-mono text-xs"
                value={sslCert}
                onChange={(e) => setSslCert(e.target.value)}
                placeholder="/etc/nginx/ssl/app.crt"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-key">SSL key path</Label>
              <Input
                id="cv-key"
                className="font-mono text-xs"
                value={sslKey}
                onChange={(e) => setSslKey(e.target.value)}
                placeholder="/etc/nginx/ssl/app.key"
              />
            </div>
          </div>
          {nodes.length === 0 && (
            <Alert>
              <AlertTitle>Belum ada nginx node</AlertTitle>
              <AlertDescription>
                Daftarkan node (agent infra_control) terlebih dahulu.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || nodes.length === 0}>
              {busy ? 'Menyimpan…' : 'Buat Virtual Host'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
