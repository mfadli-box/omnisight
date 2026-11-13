/**
 * SSE client adapter untuk live logs (`GET /api/proxy/v1/infra/logs/stream`).
 *
 * Memakai `fetch` + `ReadableStream` (bukan `EventSource`) agar:
 *  - header `X-Correlation-ID` bisa disuntik (propagasi trace end-to-end),
 *  - koneksi bawa cookie HttpOnly same-origin (kredensial browser standar),
 *  - aliran event dibaca tanpa buffering penuh (baris diparse inkremental).
 *
 * Format upstream (api-w2.md §2.6):
 *   event: log\ndata: {ts,scope,reference,company_id,level,source,message}\n\n
 *   event: lagged\ndata: {"dropped":true}\n\n
 */

import { proxyFetch } from '@/infrastructure/api/client'
import type { SseLogEvent } from '@/domain/entities/infra'

export interface LogStreamHandlers {
  onEvent: (event: SseLogEvent) => void
  onLagged?: () => void
  onError?: (error: Error) => void
  onOpen?: () => void
}

export interface LogStreamHandle {
  close(): void
}

interface SseFrame {
  event: string
  dataLines: string[]
}

function emptyFrame(): SseFrame {
  return { event: 'message', dataLines: [] }
}

/** Parse frame SSE selesai → callback; shape divalidasi defensif (no `any`). */
function dispatchFrame(frame: SseFrame, handlers: LogStreamHandlers): void {
  const data = frame.dataLines.join('\n')
  if (data.length === 0) return
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return
  }
  if (frame.event === 'log' && isLogEvent(parsed)) {
    handlers.onEvent(parsed)
    return
  }
  if (frame.event === 'lagged') {
    handlers.onLagged?.()
  }
}

function isLogEvent(value: unknown): value is SseLogEvent {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.ts === 'string' &&
    typeof v.scope === 'string' &&
    typeof v.level === 'string' &&
    typeof v.message === 'string'
  )
}

/** Buka stream SSE; mengembalikan handle `close()`. Loop berhenti saat abort. */
export function openLogStream(
  params: { scope?: string; reference?: string },
  handlers: LogStreamHandlers,
): LogStreamHandle {
  const controller = new AbortController()

  void (async () => {
    const query = new URLSearchParams()
    if (params.scope) query.set('scope', params.scope)
    if (params.reference) query.set('reference', params.reference)
    const suffix = query.toString() !== '' ? `?${query.toString()}` : ''

    let res: Response
    try {
      res = await proxyFetch(`/v1/infra/logs/stream${suffix}`, {
        headers: { accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError?.(error instanceof Error ? error : new Error('SSE connect gagal'))
      }
      return
    }

    if (!res.ok || !res.body) {
      handlers.onError?.(new Error(`SSE stream gagal (HTTP ${res.status})`))
      return
    }

    handlers.onOpen?.()

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let frame = emptyFrame()

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let nl = buffer.indexOf('\n')
        while (nl >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, '')
          buffer = buffer.slice(nl + 1)
          if (line.length === 0) {
            // Baris kosong = akhir frame → dispatch.
            dispatchFrame(frame, handlers)
            frame = emptyFrame()
          } else if (line.startsWith(':')) {
            // komentar keep-alive — abaikan
          } else if (line.startsWith('event:')) {
            frame.event = line.slice(6).trim() || 'message'
          } else if (line.startsWith('data:')) {
            frame.dataLines.push(line.slice(5).trimStart())
          }
          nl = buffer.indexOf('\n')
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError?.(error instanceof Error ? error : new Error('SSE stream terputus'))
      }
    } finally {
      reader.releaseLock()
    }
  })()

  return { close: () => controller.abort() }
}
