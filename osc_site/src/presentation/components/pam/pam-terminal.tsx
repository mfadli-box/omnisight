'use client'

/**
 * Terminal interaktif PAM (xterm.js) — terhubung langsung ke
 * `pam_bastion_gateway` (WebSocket) menggunakan **ephemeral ticket** sekali
 * pakai hasil `POST /pam/sessions/authorize` (TTL ≤ 120 s). Cookie/JWT TIDAK
 * pernah menyentuh koneksi WS ini.
 *
 * Isolasi: komponen khusus klien, resize observer, dan pembersihan penuh
 * (dispose terminal + close socket) saat unmount.
 */

import { useEffect, useRef, useState } from 'react'

import { buildBastionWsUrl } from '@/application/usecases/w3'
import { Alert, AlertDescription, AlertTitle } from '@/presentation/components/ui/alert'
import { Skeleton } from '@/presentation/components/ui/skeleton'

export interface PamTerminalProps {
  sessionId: string
  ticket: string
  /** Label target untuk header sesi (mis. `root@web-prod-01:22`). */
  targetLabel: string
}

export function PamTerminal({ sessionId, ticket, targetLabel }: PamTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'connected' | 'closed' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let terminal: import('@xterm/xterm').Terminal | null = null
    let socket: WebSocket | null = null
    let resizeObserver: ResizeObserver | null = null

    async function open() {
      const container = containerRef.current
      if (!container) return
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ])
        await import('@xterm/xterm/css/xterm.css')
        if (disposed) return

        terminal = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          theme: { background: '#0a0a0a' },
        })
        const fit = new FitAddon()
        terminal.loadAddon(fit)
        terminal.open(container)
        fit.fit()
        terminal.writeln(`Menghubungkan ke ${targetLabel} via pam_bastion_gateway …`)

        const wsUrl = buildBastionWsUrl(sessionId, ticket)
        socket = new WebSocket(wsUrl)
        socket.binaryType = 'arraybuffer'
        socket.onopen = () => {
          if (disposed) return
          setStatus('connected')
          terminal?.writeln('\r\nSesi terhubung (direkam untuk audit).\r\n')
        }
        socket.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            terminal?.write(new TextDecoder().decode(event.data))
          } else {
            terminal?.write(String(event.data))
          }
        }
        socket.onclose = () => {
          if (disposed) return
          setStatus('closed')
          terminal?.writeln('\r\n[Sesi ditutup]\r\n')
        }
        socket.onerror = () => {
          if (disposed) return
          setStatus('error')
          setError('Koneksi ke pam_bastion_gateway gagal (ticket mungkin sudah ditebus/kedaluwarsa).')
        }
        terminal.onData((data) => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(new TextEncoder().encode(data))
        })

        resizeObserver = new ResizeObserver(() => fit.fit())
        resizeObserver.observe(container)
      } catch (err) {
        if (!disposed) {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'Gagal memuat terminal.')
        }
      }
    }

    void open()
    return () => {
      disposed = true
      resizeObserver?.disconnect()
      socket?.close()
      terminal?.dispose()
    }
    // ticket & sessionId stabil selama umur sesi (ticket sekali-pakai).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, ticket])

  return (
    <div className="space-y-2">
      {status === 'loading' && <Skeleton className="h-64 w-full" />}
      {status === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>Koneksi terminal gagal</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div
        ref={containerRef}
        className={status === 'error' ? 'hidden' : 'h-64 overflow-hidden rounded-md border bg-[#0a0a0a] p-1'}
        aria-label={`Terminal SSH ${targetLabel}`}
      />
    </div>
  )
}

