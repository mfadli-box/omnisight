'use client'

/**
 * NOC Command Center Dashboard (route menu `uptime.monitors`).
 *  - Grafik metrik host (CPU/RAM/Disk) + S.M.A.R.T. dari snapshot telemetri
 *    (dibaca lewat Dynamic Query API `items/{collection}`, tenant-guarded).
 *  - Status Uptime Monitors di-merge dengan rollup status page publik.
 *  - Generator Agent Enrollment Token (hanya bila privilege `admin.agents`
 *    can_create pada Company aktif — section lain tetap tampil).
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCcw } from 'lucide-react'

import type { DynamicItem } from '@/domain/entities/studio'
import type { PublicMonitorRollup, UptimeMonitor } from '@/domain/entities/infra'
import type { IInfraGateway } from '@/domain/gateways/infra'
import type { IStudioGateway } from '@/domain/gateways/studio'
import { ApiClientError } from '@/domain/errors'
import {
  MONITOR_STATUS_VARIANT,
  formatBytes,
  formatUptime,
  numField,
  ratioPct,
  sslExpiryRows,
  strField,
} from '@/application/usecases/infra'
import { Badge } from '@/presentation/components/ui/badge'
import { Button } from '@/presentation/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card'
import { Skeleton } from '@/presentation/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table'
import { EnrollmentTokenCard } from '@/presentation/components/infra/enrollment-token-card'
import { MetricCard } from '@/presentation/components/infra/metric-card'

/** Koleksi telemetri (Skema P3) yang dibaca lewat Dynamic Query API. */
const METRIC_COLLECTION = 'system_metric_snapshots'
const SMART_COLLECTION = 'hardware_inventory_snapshots'
/** Maksimum sampel yang diambil untuk sparkline & nilai terakhir. */
const SAMPLE_LIMIT = 100

function sortByRecorded(items: DynamicItem[]): DynamicItem[] {
  return [...items].sort((a, b) => {
    const ra = strField(a.data, 'recorded_at') ?? a.created_at
    const rb = strField(b.data, 'recorded_at') ?? b.created_at
    return ra.localeCompare(rb)
  })
}

export function NocDashboardClient({
  gateway,
  studio,
}: {
  gateway: IInfraGateway
  studio: IStudioGateway
}) {
  const [monitors, setMonitors] = useState<UptimeMonitor[] | null>(null)
  const [rollups, setRollups] = useState<PublicMonitorRollup[]>([])
  const [metrics, setMetrics] = useState<DynamicItem[] | null>(null)
  const [smart, setSmart] = useState<DynamicItem[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const results = await Promise.allSettled([
        gateway.listMonitors(),
        loadPublishedRollups(gateway),
        studio.listItems(METRIC_COLLECTION, SAMPLE_LIMIT),
        studio.listItems(SMART_COLLECTION, SAMPLE_LIMIT),
      ])
      if (cancelled) return
      const [m, r, sys, sm] = results
      setMonitors(m.status === 'fulfilled' ? m.value : [])
      setRollups(r.status === 'fulfilled' ? r.value : [])
      setMetrics(sys.status === 'fulfilled' ? sortByRecorded(sys.value) : null)
      setSmart(sm.status === 'fulfilled' ? sortByRecorded(sm.value) : null)
      for (const result of results) {
        if (result.status === 'rejected') {
          toast.error(
            result.reason instanceof ApiClientError
              ? result.reason.message
              : 'Gagal memuat sebagian data NOC',
          )
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [gateway, studio, reloadKey])

  // --- derivasi metrik host (app-level, bukan XSS-prone markup) -----------
  const hostSamples = metrics ?? []
  const latest = hostSamples.length > 0 ? hostSamples[hostSamples.length - 1].data : null
  const cpuPct = latest ? numField(latest, 'cpu_usage_pct') : null
  const memPct = latest
    ? ratioPct(numField(latest, 'mem_used_bytes'), numField(latest, 'mem_total_bytes'))
    : null
  const diskPct = latest
    ? ratioPct(numField(latest, 'disk_used_bytes'), numField(latest, 'disk_total_bytes'))
    : null
  const uptimeSeconds = latest ? numField(latest, 'uptime_seconds') : null
  const memDetail = latest
    ? `${formatBytes(numField(latest, 'mem_used_bytes'))} / ${formatBytes(numField(latest, 'mem_total_bytes'))}`
    : 'Snapshot belum tersedia'
  const diskDetail = latest
    ? `${formatBytes(numField(latest, 'disk_used_bytes'))} / ${formatBytes(numField(latest, 'disk_total_bytes'))}`
    : 'Snapshot belum tersedia'

  const rollupById = new Map(rollups.map((r) => [r.id, r]))
  const monitorRows = (monitors ?? []).map((m) => ({
    monitor: m,
    rollup: rollupById.get(m.id) ?? null,
  }))

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">NOC Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Telemetri host, status uptime, & enrollment agent — konteks company
            aktif (tenant-guarded upstream).
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={reload} aria-label="Refresh">
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* --- Metrik host --- */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="CPU"
          percent={cpuPct}
          detail={uptimeSeconds !== null ? `Host uptime ${formatUptime(uptimeSeconds)}` : 'Menunggu ingest agent'}
          history={hostSamples.slice(-24).map((s) => numField(s.data, 'cpu_usage_pct') ?? 0)}
        />
        <MetricCard
          label="RAM"
          percent={memPct}
          detail={memDetail}
          history={hostSamples.slice(-24).map((s) => ratioPct(numField(s.data, 'mem_used_bytes'), numField(s.data, 'mem_total_bytes')) ?? 0)}
        />
        <MetricCard
          label="Disk"
          percent={diskPct}
          detail={diskDetail}
          history={hostSamples.slice(-24).map((s) => ratioPct(numField(s.data, 'disk_used_bytes'), numField(s.data, 'disk_total_bytes')) ?? 0)}
        />
      </div>

      {/* --- S.M.A.R.T. --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">S.M.A.R.T. Health</CardTitle>
          <CardDescription>
            Laporan disk dari agent (persist di `hardware_inventory_snapshots`).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {smart === null ? (
            <Skeleton className="h-24 w-full" />
          ) : smart.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Belum ada laporan S.M.A.R.T. — jalankan host_telemetry_agent dengan ingest metrik.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Suhu</TableHead>
                    <TableHead>Reallocated Sectors</TableHead>
                    <TableHead>Power-On Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smart.slice(-32).reverse().map((item) => {
                    const health = strField(item.data, 'health') ?? 'UNKNOWN'
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">
                          {strField(item.data, 'device') ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={health === 'PASSED' ? 'success' : 'destructive'}>
                            {health}
                          </Badge>
                        </TableCell>
                        <TableCell>{numField(item.data, 'temperature_c') ?? '—'} °C</TableCell>
                        <TableCell>{numField(item.data, 'reallocated_sectors') ?? '—'}</TableCell>
                        <TableCell>{numField(item.data, 'power_on_hours') ?? '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Uptime Monitors --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uptime Monitors</CardTitle>
          <CardDescription>
            Status dari rollup status page (heartbeat agent `network_poller_agent`).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monitors === null ? (
            <Skeleton className="h-24 w-full" />
          ) : monitorRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Belum ada monitor.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ping</TableHead>
                    <TableHead>Uptime 24j</TableHead>
                    <TableHead>Pesan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monitorRows.map(({ monitor, rollup }) => (
                    <TableRow key={monitor.id}>
                      <TableCell className="font-medium">{monitor.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{monitor.type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">
                        {monitor.target}
                      </TableCell>
                      <TableCell>
                        {rollup?.status ? (
                          <Badge variant={MONITOR_STATUS_VARIANT[rollup.status] ?? 'secondary'}>
                            {rollup.status}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{monitor.is_active ? 'AKTIF' : 'NONAKTIF'}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{rollup?.ping_ms !== null && rollup?.ping_ms !== undefined ? `${rollup.ping_ms} ms` : '—'}</TableCell>
                      <TableCell>
                        {rollup?.uptime_pct_24h !== null && rollup?.uptime_pct_24h !== undefined
                          ? `${rollup.uptime_pct_24h.toFixed(2)}%`
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                        {rollup?.message ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- SSL expiry ringkas (sumber: monitor HTTPS/KEYWORD) --- */}
      <SslSummary rollups={rollups} />

      {/* --- Agent Enrollment (gated menu admin.agents, dihitung internal) --- */}
      <EnrollmentTokenCard gateway={gateway} />
    </div>
  )
}

function SslSummary({
  rollups,
}: {
  rollups: Array<Pick<PublicMonitorRollup, 'id' | 'name' | 'type' | 'status' | 'message'>>
}) {
  const rows = sslExpiryRows(rollups)
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">SSL Certificate Expiry</CardTitle>
        <CardDescription>
          Diekstrak dari pesan heartbeat monitor HTTPS/KEYWORD (agent network_poller).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <Badge
              key={row.monitorId}
              variant={row.state === 'EXPIRED' ? 'destructive' : row.state === 'WARNING' ? 'warning' : 'success'}
            >
              {row.name}: {row.expiryText.slice(0, 10)}
              {row.daysRemaining !== null ? ` (${row.daysRemaining} hari)` : ''}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** Rollup semua status page ter-publish company aktif (gagal per-slug diabaikan). */
async function loadPublishedRollups(gateway: IInfraGateway): Promise<PublicMonitorRollup[]> {
  const pages = await gateway.listStatusPages()
  const published = pages.filter((p) => p.is_published)
  const results = await Promise.allSettled(published.map((p) => gateway.getPublicStatusPage(p.slug)))
  const merged: PublicMonitorRollup[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') merged.push(...result.value.monitors)
  }
  return merged
}
