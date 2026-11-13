'use client'

/**
 * Session Replay Viewer PAM — memutar rekaman terminal (.cast asciinema v2,
 * gzip ditranspar oleh server bila tersedia) dari bucket privat RustFS.
 * Rekaman dimuat via BFF proxy; playback ditiming ulang di klien (speed
 * dikendalikan user) — tanpa `dangerouslySetInnerHTML`.
 */

import { useEffect, useRef, useState } from 'react'

import { proxyFetch } from '@/infrastructure/api/client'
import { parseCast, castDuration, type ReplayEvent } from '@/application/usecases/w3'
import { Button } from '@/presentation/components/ui/button'
import { Progress } from '@/presentation/components/ui/progress'
import { Badge } from '@/presentation/components/ui/badge'

export interface PamReplayViewerProps {
  sessionId: string
}

const SPEEDS = [0.5, 1, 2, 4] as const

export function PamReplayViewer({ sessionId }: PamReplayViewerProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState<number>(1)

  const stateRef = useRef<{
    events: ReplayEvent[]
    duration: number
    index: number
    timer: number | null
    write: ((data: string) => void) | null
  }>({ events: [], duration: 0, index: 0, timer: null, write: null })

  useEffect(() => {
    let disposed = false
    let terminal: import('@xterm/xterm').Terminal | null = null

    async function load() {
      const container = terminalRef.current
      if (!container) return
      const res = await proxyFetch(`/v1/pam/sessions/${encodeURIComponent(sessionId)}/recording`)
      if (!res.ok) {
        if (!disposed) {
          setStatus('error')
          setMessage(
            res.status === 404
              ? 'Rekaman sesi ini tidak tersedia (belum diunggah gateway atau endpoint unduhan belum diaktifkan).'
              : `Gagal memuat rekaman (HTTP ${res.status}).`,
          )
        }
        return
      }
      const text = await res.text()
      if (disposed) return
      const events = parseCast(text)
      stateRef.current.events = events
      stateRef.current.duration = castDuration(events)

      const { Terminal } = await import('@xterm/xterm')
      await import('@xterm/xterm/css/xterm.css')
      if (disposed) return
      terminal = new Terminal({ fontSize: 12, disableStdin: true, cursorBlink: false })
      terminal.open(container)
      stateRef.current.write = (data) => terminal?.write(data)
      setStatus('ready')
    }

    void load().catch(() => {
      if (!disposed) {
        setStatus('error')
        setMessage('Gagal memuat rekaman.')
      }
    })
    return () => {
      disposed = true
      stopTimer()
      terminal?.dispose()
    }
  }, [sessionId])

  function stopTimer() {
    if (stateRef.current.timer !== null) {
      window.clearTimeout(stateRef.current.timer)
      stateRef.current.timer = null
    }
  }

  function playNext() {
    const state = stateRef.current
    if (state.index >= state.events.length) {
      setPlaying(false)
      return
    }
    const current = state.events[state.index]
    state.write?.(current.data)
    state.index += 1
    setProgress(state.duration > 0 ? (current.time / state.duration) * 100 : 100)
    const next = state.events[state.index]
    if (!next) {
      setPlaying(false)
      return
    }
    const delay = Math.max(0, (next.time - current.time) / speed) * 1000
    state.timer = window.setTimeout(playNext, delay)
  }

  function togglePlay() {
    const state = stateRef.current
    if (playing) {
      stopTimer()
      setPlaying(false)
      return
    }
    if (state.index >= state.events.length) {
      // mulai ulang dari awal
      state.index = 0
      state.write?.('\x1b[2J\x1b[H')
      setProgress(0)
    }
    setPlaying(true)
    playNext()
  }

  function reset() {
    stopTimer()
    const state = stateRef.current
    state.index = 0
    state.write?.('\x1b[2J\x1b[H')
    setProgress(0)
    setPlaying(false)
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border bg-[#0a0a0a] p-1">
        <div ref={terminalRef} aria-label="Rekaman sesi" className="h-64" />
        {status === 'loading' && <p className="p-4 text-sm text-muted-foreground">Memuat rekaman…</p>}
      </div>
      {status === 'error' && <p className="text-sm text-muted-foreground">{message}</p>}
      {status === 'ready' && (
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={togglePlay}>
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button size="sm" variant="outline" onClick={reset}>
            Ulangi
          </Button>
          <div className="flex gap-1">
            {SPEEDS.map((s) => (
              <Badge
                key={s}
                variant={speed === s ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSpeed(s)}
              >
                {s}x
              </Badge>
            ))}
          </div>
          <Progress value={progress} className="flex-1" />
        </div>
      )}
    </div>
  )
}
