"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { Button } from "./button"
import { Spinner } from "./spinner"
import { Badge } from "./badge"
import { useSocket } from "@/lib/ws"
import {
  Maximize2Icon,
  Minimize2Icon,
  MonitorIcon,
  MousePointerClickIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react"

export type RemoteDesktopProtocol = "rdp" | "vnc" | "spice" | "guacamole"

export interface RemoteDesktopHandle {
  connect: () => void
  disconnect: () => void
  reset: () => void
  sendInput: (data: string | ArrayBuffer) => void
}

export interface RemoteDesktopProps extends React.ComponentProps<"div"> {
  title?: string
  url?: string
  protocol?: RemoteDesktopProtocol
  status?: "idle" | "connecting" | "connected" | "disconnected" | "error"
  username?: string
  password?: string
  domain?: string
  onStatusChange?: (status: NonNullable<RemoteDesktopProps["status"]>) => void
  onDisconnect?: () => void
  onConnect?: () => void
  readOnly?: boolean
  showToolbar?: boolean
  showStatusBar?: boolean
  scale?: "auto" | "fit" | "100%"
  reconnectOnClose?: boolean
  className?: string
}

const RemoteDesktop = React.forwardRef<RemoteDesktopHandle, RemoteDesktopProps>(
  function RemoteDesktop(
    {
      title = "Remote Desktop",
      url,
      protocol = "rdp",
      status: controlledStatus,
      username,
      password,
      domain,
      onStatusChange,
      onDisconnect,
      onConnect,
      readOnly = false,
      showToolbar = true,
      showStatusBar = true,
      scale = "auto",
      reconnectOnClose = true,
      className,
      ...props
    },
    ref,
  ) {
    const [internalStatus, setInternalStatus] = React.useState<RemoteDesktopProps["status"]>("idle")
    const [isFullscreen, setIsFullscreen] = React.useState(false)
    const [started, setStarted] = React.useState(false)
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const frameRef = React.useRef<number | null>(null)
    const status = controlledStatus ?? internalStatus
    const statusRef = React.useRef(status)
    statusRef.current = status

    const setStatus = React.useCallback(
      (next: NonNullable<RemoteDesktopProps["status"]>) => {
        if (controlledStatus === undefined) setInternalStatus(next)
        onStatusChange?.(next)
      },
      [controlledStatus, onStatusChange],
    )

    const onMessageRef = React.useRef<(msg: MessageEvent<string>) => void>(() => {})
    const { status: socketStatus, send, sendJson } = useSocket({
      url,
      enabled: started,
      query: { protocol },
      onOpen: () => {
        setStatus("connected")
        sendJson({ action: "connect", username, password, domain })
      },
      onClose: () => {
        setStatus(reconnectOnClose && statusRef.current === "connected" ? "connecting" : "disconnected")
      },
      onError: () => setStatus("error"),
      onMessage: (msg) => onMessageRef.current(msg),
    })

    const handleConnect = React.useCallback(() => {
      if (!url) {
        setStatus("error")
        return
      }
      setStatus("connecting")
      setStarted(true)
      onConnect?.()
    }, [url, onConnect, setStatus])

    const handleDisconnect = React.useCallback(() => {
      setStarted(false)
      sendJson({ action: "disconnect" })
      setStatus("disconnected")
      onDisconnect?.()
    }, [sendJson, onDisconnect, setStatus])

    const handleReset = React.useCallback(() => {
      sendJson({ action: "reset" })
      setStatus("connecting")
    }, [sendJson, setStatus])

    React.useImperativeHandle(ref, () => ({
      connect: handleConnect,
      disconnect: handleDisconnect,
      reset: handleReset,
      sendInput: (data) => {
        if (socketStatus === "open" && statusRef.current === "connected") {
          if (typeof data === "string") send(data)
          else if (data instanceof ArrayBuffer) sendJson({ action: "input", data: arrayBufferToB64(data) })
        }
      },
    }), [handleConnect, handleDisconnect, handleReset, socketStatus, send, sendJson])

    const interactive = socketStatus === "open" && status === "connected" && !readOnly

    React.useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const scaleToFit = () => {
        const parent = canvas.parentElement
        if (!parent) return
        if (scale === "100%") {
          canvas.style.width = "auto"
          canvas.style.height = "auto"
          return
        }
        const pw = parent.clientWidth
        const ph = parent.clientHeight
        if (pw <= 0 || ph <= 0) return
        const sw = canvas.width > 0 ? pw / canvas.width : 1
        const sh = canvas.height > 0 ? ph / canvas.height : 1
        const s = scale === "fit" ? Math.min(sw, sh) : Math.min(sw, sh)
        canvas.style.width = `${canvas.width * s}px`
        canvas.style.height = `${canvas.height * s}px`
      }
      const ro = new ResizeObserver(() => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
        frameRef.current = requestAnimationFrame(scaleToFit)
      })
      ro.observe(canvas.parentElement as Element)
      return () => {
        ro.disconnect()
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      }
    }, [scale])

    React.useEffect(() => {
      if (isFullscreen) {
        requestAnimationFrame(() => {
          const canvas = canvasRef.current
          if (!canvas) return
          const parent = canvas.parentElement
          if (!parent) return
          const s = Math.min(parent.clientWidth / Math.max(canvas.width, 1), parent.clientHeight / Math.max(canvas.height, 1))
          canvas.style.width = `${canvas.width * s}px`
          canvas.style.height = `${canvas.height * s}px`
        })
      }
    }, [isFullscreen])

    React.useEffect(() => {
      onMessageRef.current = (msg) => {
        const data = msg.data
        if (typeof data !== "string") return
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === "frame") {
            drawFrame(canvasRef.current, parsed.data)
          } else if (parsed.type === "connected") {
            setStatus("connected")
          } else if (parsed.type === "closed") {
            setStatus("disconnected")
          }
        } catch {
          // raw binary frame base64 string
          drawFrame(canvasRef.current, data)
        }
      }
    }, [setStatus])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!interactive || status !== "connected") return
      e.preventDefault()
      sendJson({
        action: "key",
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        type: "down",
      })
    }
    const handleKeyUp = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!interactive || status !== "connected") return
      e.preventDefault()
      sendJson({
        action: "key",
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        type: "up",
      })
    }
    const handleMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactive || status !== "connected") return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width)
      const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height)
      sendJson({
        action: "mouse",
        type: e.type,
        x,
        y,
        button: e.button,
      })
      if (e.type === "mousedown") e.preventDefault()
    }
    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!interactive || status !== "connected") return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width)
      const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height)
      sendJson({
        action: "wheel",
        x,
        y,
        deltaY: e.deltaY,
      })
      e.preventDefault()
    }

    const statusMeta: Record<string, { label: string; dot: string }> = {
      idle: { label: "Idle", dot: "bg-gray-400" },
      connecting: { label: "Connecting", dot: "bg-yellow-400 animate-pulse" },
      connected: { label: "Connected", dot: "bg-emerald-500" },
      disconnected: { label: "Disconnected", dot: "bg-gray-400" },
      error: { label: "Error", dot: "bg-red-500" },
    }

    return (
      <div
        data-slot="remote-desktop"
        className={cn(
          "flex flex-col overflow-hidden rounded-md border bg-gray-950 text-gray-100",
          isFullscreen && "fixed inset-0 z-50 rounded-none border-0",
          className,
        )}
        {...props}
      >
        {showToolbar && (
          <div className="flex items-center justify-between gap-2 border-b border-gray-800 bg-gray-900/50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <MonitorIcon className="size-4 shrink-0 text-gray-500" />
              <span className="truncate text-xs font-medium text-gray-300">{title}</span>
              <Badge variant="outline" className="hidden border-gray-700 text-[10px] text-gray-400 sm:inline-flex">
                {protocol.toUpperCase()}
              </Badge>
              {readOnly && (
                <Badge variant="outline" className="border-gray-700 text-[10px] text-gray-500">
                  Read-only
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {status === "connected" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  className="h-6 px-2 text-gray-400 hover:text-red-400"
                >
                  <PowerIcon className="size-3.5" />
                  <span className="ml-1 hidden sm:inline">Disconnect</span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleConnect}
                  disabled={!url || status === "connecting"}
                  className="h-6 px-2 text-gray-400 hover:text-emerald-400"
                >
                  <PlayIcon className="size-3.5" />
                  <span className="ml-1 hidden sm:inline">Connect</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => sendJson({ action: "reset" })}
                disabled={status !== "connected"}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen((v) => !v)}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
              >
                {isFullscreen ? <Minimize2Icon className="size-3.5" /> : <Maximize2Icon className="size-3.5" />}
              </Button>
            </div>
          </div>
        )}

        <div
          className={cn(
            "relative flex flex-1 items-center justify-center overflow-hidden bg-[#0a0a0a]",
            interactive && "cursor-crosshair",
          )}
        >
          {status === "connecting" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0a0a0a]/80">
              <Spinner className="size-6 text-gray-500" />
              <span className="text-xs text-gray-500">Connecting to {protocol.toUpperCase()} session…</span>
            </div>
          )}
          {status === "idle" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-gray-600">
              <MonitorIcon className="size-10" />
              <span className="text-xs">Session not started</span>
            </div>
          )}
          {status === "disconnected" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-gray-600">
              <PauseIcon className="size-10" />
              <span className="text-xs">Session disconnected</span>
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-red-500">
              <RotateCcwIcon className="size-10" />
              <span className="text-xs">Failed to establish session</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={1024}
            height={768}
            tabIndex={0}
            className="max-w-full max-h-full touch-none outline-none"
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onMouseDown={handleMouse}
            onMouseUp={handleMouse}
            onMouseMove={handleMouse}
            onClick={() => !readOnly && interactive && sendJson({ action: "click", button: 0 })}
            onWheel={handleWheel}
          />
        </div>

        {showStatusBar && (
          <div className="flex items-center justify-between gap-2 border-t border-gray-800 bg-gray-900/50 px-3 py-1.5">
            <Badge variant="outline" className="gap-1.5 border-gray-700 px-1.5 text-[11px] text-gray-400">
              <span className={cn("size-1.5 rounded-full", statusMeta[status ?? "idle"].dot)} />
              {statusMeta[status ?? "idle"].label}
            </Badge>
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              {interactive && status === "connected" && (
                <MousePointerClickIcon className="size-3" />
              )}
              <span>{scale === "100%" ? "100%" : "Auto-fit"}</span>
            </div>
          </div>
        )}
      </div>
    )
  },
)

function drawFrame(canvas: HTMLCanvasElement | null, data: string | undefined) {
  if (!canvas || !data) return
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const img = new Image()
  img.onload = () => {
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width
      canvas.height = img.height
    }
    ctx.drawImage(img, 0, 0)
  }
  img.src = `data:image/png;base64,${data}`
}

function arrayBufferToB64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export { RemoteDesktop, drawFrame, arrayBufferToB64 }
export default RemoteDesktop
