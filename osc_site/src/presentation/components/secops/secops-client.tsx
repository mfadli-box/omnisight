'use client'

/**
 * SecOps & Vulnerability Center:
 *  - Kartu hitungan (FIM unresolved / alert unack / CVE open).
 *  - Dashboard Security Alerts (severity + tag MITRE ATT&CK).
 *  - FIM Change Logs (path, event, checksum, detection source).
 *  - Daftar CVE per asset (dikelompokkan asset, CVSS).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bug, FileWarning, ShieldAlert } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import type {
  SecurityAlertEvent,
  SecOpsOverview,
  VulnerabilityFinding,
} from '@/domain/entities/w3'
import { clientGateways } from '@/infrastructure/api/gateways'
import { SEVERITY_VARIANT, formatBytes, formatDateTime } from '@/application/usecases/w3'
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

export function SecOpsClient() {
  const gateway = clientGateways().secops

  const [overview, setOverview] = useState<SecOpsOverview | null>(null)
  const [alerts, setAlerts] = useState<SecurityAlertEvent[] | null>(null)
  const [vulns, setVulns] = useState<VulnerabilityFinding[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [ov, al, vu] = await Promise.all([
        gateway.getOverview(),
        gateway.listAlerts(),
        gateway.listVulnerabilities(),
      ])
      setOverview(ov)
      setAlerts(al)
      setVulns(vu)
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? `${err.message} (${err.code})`
          : 'Gagal memuat data SecOps.',
      )
    }
  }, [gateway])

  useEffect(() => {
    void reload()
  }, [reload])

  const vulnByAsset = useMemo(() => {
    const map = new Map<string, { asset: string; items: VulnerabilityFinding[] }>()
    for (const v of vulns ?? []) {
      const key = v.asset_id
      const entry = map.get(key) ?? { asset: v.asset_name ?? v.asset_id, items: [] }
      entry.items.push(v)
      map.set(key, entry)
    }
    return [...map.values()]
  }, [vulns])

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Gagal memuat</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <CountCard
          label="FIM Belum Selesai"
          value={overview?.counts.fim_unresolved}
          icon={<FileWarning className="h-4 w-4" />}
        />
        <CountCard
          label="Alert Belum Diacknowledge"
          value={overview?.counts.alerts_unacknowledged}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <CountCard
          label="CVE Terbuka"
          value={overview?.counts.vulnerabilities_open}
          icon={<Bug className="h-4 w-4" />}
        />
      </div>

      <Tabs defaultValue="alerts">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="alerts">Security Alerts</TabsTrigger>
            <TabsTrigger value="fim">FIM Change Logs</TabsTrigger>
            <TabsTrigger value="cve">CVE per Asset</TabsTrigger>
          </TabsList>
          <Button size="sm" variant="ghost" onClick={() => void reload()}>
            Muat ulang
          </Button>
        </div>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Dashboard Security Alerts</CardTitle>
              <CardDescription>
                Anomali log (Sigma/Syscheck) — severity, kategori, dan pemetaan MITRE ATT&CK.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alerts === null ? (
                <Skeleton className="h-40 w-full" />
              ) : alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada alert keamanan.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>MITRE ATT&CK</TableHead>
                      <TableHead>Sumber</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateTime(alert.detected_at)}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{alert.rule_name}</span>
                          {alert.category && (
                            <span className="block text-xs text-muted-foreground">{alert.category}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={SEVERITY_VARIANT[alert.severity]}>{alert.severity}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {alert.mitre_tactic && (
                            <Badge variant="outline" className="mr-1">
                              {alert.mitre_tactic}
                            </Badge>
                          )}
                          {alert.mitre_technique && <span className="font-mono">{alert.mitre_technique}</span>}
                          {!alert.mitre_tactic && !alert.mitre_technique && '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{alert.source_ip ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fim">
          <Card>
            <CardHeader>
              <CardTitle>FIM Change Logs</CardTitle>
              <CardDescription>
                Perubahan file (baseline realtime/scheduled) — checksum SHA-256 lama → baru.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overview === null ? (
                <Skeleton className="h-40 w-full" />
              ) : overview.fim_recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada event FIM terbaru.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Sumber</TableHead>
                      <TableHead>Checksum (baru)</TableHead>
                      <TableHead>Ukuran</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.fim_recent.map((fim) => (
                      <TableRow key={fim.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDateTime(fim.detected_at)}</TableCell>
                        <TableCell className="max-w-[260px] truncate font-mono text-xs" title={fim.path}>
                          {fim.path}
                        </TableCell>
                        <TableCell>
                          <Badge variant={fim.event_type === 'DELETED' ? 'destructive' : 'secondary'}>
                            {fim.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{fim.detection_source}</TableCell>
                        <TableCell className="max-w-[140px] truncate font-mono text-xs" title={fim.new_checksum ?? ''}>
                          {fim.new_checksum ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">{formatBytes(fim.size_bytes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cve">
          <div className="space-y-4">
            {vulns === null ? (
              <Skeleton className="h-40 w-full" />
            ) : vulnByAsset.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Tidak ada temuan kerentanan.</p>
                </CardContent>
              </Card>
            ) : (
              vulnByAsset.map((group) => (
                <Card key={group.asset}>
                  <CardHeader>
                    <CardTitle className="text-base">{group.asset}</CardTitle>
                    <CardDescription>{group.items.length} CVE terdeteksi</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>CVE</TableHead>
                          <TableHead>Judul</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>CVSS</TableHead>
                          <TableHead>Versi</TableHead>
                          <TableHead>Terdeteksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono text-xs font-medium">{v.cve_id}</TableCell>
                            <TableCell className="max-w-[280px] truncate" title={v.title}>
                              {v.title}
                            </TableCell>
                            <TableCell>
                              <Badge variant={SEVERITY_VARIANT[v.severity]}>{v.severity}</Badge>
                            </TableCell>
                            <TableCell className="tabular-nums">{v.cvss_score ?? '—'}</TableCell>
                            <TableCell className="text-xs">
                              {v.version_installed ?? '—'} {v.version_fixed ? `→ fix ${v.version_fixed}` : ''}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatDateTime(v.last_detected_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CountCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number | undefined
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon} {label}
        </CardTitle>
        <div className="text-3xl font-semibold tabular-nums">{value ?? '—'}</div>
      </CardHeader>
      <CardContent />
    </Card>
  )
}
