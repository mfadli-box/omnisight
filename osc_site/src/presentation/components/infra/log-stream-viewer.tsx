'use client'

/**
 * Viewer live logs SSE (`GET /api/proxy/v1/infra/logs/stream`).
 * Buffer capping 300 baris (memori browser), status koneksi, cleanup
 * otomatis saat unmount / ganti referensi (AbortController).
 */

import { useEffect, useRef, useState } from 'react'

import type { LogScope } from '@/domain/entities/infra'
import { openLogStream, type LogStreamHandle } from '@/infrastructure/sse/logs-stream'
import {
  MAX_LOG_LINES,
  logLevelVariant,
  toLogLine,
  type LogLine,
} from '@/application/usecases/infra'
import { Badge } from '@/presentation/components/ui/badge'
import { Button } from '@/presentation/components/ui/button'
import { Label } from '@/presentation/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'
import { cn } from '@/presentation/lib/utils'

export interface LogStreamOption {
  id: string
  label: string
}

export function LogStreamViewer({
  scope,
  options,
}: {
  scope: LogScope
  /** Referensi yang bisa dipilih (stack / vhost); kosong = semua event company. */
  options: LogStreamOption[]
}) {
  const [reference, setReference] = useState<string>('all')
  const [lines, setLines] = useState<LogLine[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const counter = useRef(0)

  useEffect(() => {
    let handle: LogStreamHandle | null = null
    setLines([])
    setError(null)
    setConnected(false)

    handle = openLogStream(
      {
        scope,
        reference: reference === 'all' ? undefined : reference,
      },
      {
        onOpen: () => setConnected(true),
        onEvent: (event) => {
          counter.current += 1
          setLines((prev) => {
            const next = [...prev, toLogLine(event, counter.current)]
            return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next
          })
        },
        onLagged: () => setError('Subscriber lambat — sebagian event terlewat (lagged)'),
        onError: (err) => {
          setConnected(false)
          setError(err.message)
        },
      },
    )

    return () => {
      handle?.close()
    }
  }, [scope, reference])

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label>Referensi</Label>
          <Select value={reference} onValueChange={setReference}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua event company</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant={connected ? 'success' : error ? 'destructive' : 'secondary'}>
          {connected ? 'Streaming' : error ? 'Terputus' : 'Menghubungkan…'}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            counter.current = 0
            setLines([])
          }}
        >
          Bersihkan
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="h-72 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-5">
        {lines.length === 0 && (
          <p className="text-muted-foreground">
            Menunggu event log dari agent infra_control (push via HMAC /agents/logs)…
          </p>
        )}
        {lines.map((line) => (
          <div key={line.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground">{line.ts.slice(11, 19)}</span>
            <Badge
              variant={logLevelVariant(line.level)}
              className="h-4 shrink-0 px-1 text-[10px]"
            >
              {line.level}
            </Badge>
            <span className={cn('break-all', line.level === 'ERROR' && 'text-destructive')}>
              {line.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
