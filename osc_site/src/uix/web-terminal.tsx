"use client"

import * as React from "react"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { cn } from "@/lib/utility"
import { Button } from "./button"
import { Spinner } from "./spinner"
import { Badge } from "./badge"
import {
  ClipboardIcon,
  CopyIcon,
  DownloadIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlusIcon,
  MinusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

export type TerminalTheme = "dark" | "light"

export interface WebTerminalHandle {
  write: (data: string | Uint8Array) => void
  writeln: (data: string | Uint8Array) => void
  clear: () => void
  reset: () => void
  focus: () => void
  blur: () => void
  getSelection: () => string
  getBufferText: () => string
  resizeToFit: () => void
}

export interface WebTerminalProps extends React.ComponentProps<"div"> {
  title?: string
  status?: "idle" | "connecting" | "connected" | "disconnected" | "error"
  fontSize?: number
  theme?: TerminalTheme
  readOnly?: boolean
  autoFocus?: boolean
  rows?: number
  cols?: number
  fontFamily?: string
  cursorBlink?: boolean
  disableStdin?: boolean
  disabled?: boolean
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  onClear?: () => void
  onDownload?: (text: string) => void
  initialText?: string
  showToolbar?: boolean
  showStatusBar?: boolean
  className?: string
}

const darkTheme = {
  background: "#020617",
  foreground: "#e2e8f0",
  cursor: "#38bdf8",
  cursorAccent: "#020617",
  selectionBackground: "rgba(56, 189, 248, 0.3)",
  black: "#0f172a",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#38bdf8",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e2e8f0",
  brightBlack: "#64748b",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#7dd3fc",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#f8fafc",
}

const lightTheme = {
  background: "#ffffff",
  foreground: "#1e293b",
  cursor: "#0f172a",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(15, 23, 42, 0.2)",
  black: "#1e293b",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#334155",
  brightBlack: "#64748b",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#0f172a",
}

const WebTerminal = React.forwardRef<WebTerminalHandle, WebTerminalProps>(
  function WebTerminal(
    {
      title,
      status = "idle",
      fontSize = 13,
      theme = "dark",
      readOnly = false,
      autoFocus = false,
      rows = 24,
      cols = 80,
      fontFamily = "var(--font-mono), Consolas, 'Courier New', monospace",
      cursorBlink = true,
      disableStdin = false,
      disabled = false,
      onData,
      onResize,
      onClear,
      onDownload,
      initialText,
      showToolbar = true,
      showStatusBar = true,
      className,
      ...props
    },
    ref,
  ) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const termRef = React.useRef<XTerm | null>(null)
    const fitRef = React.useRef<FitAddon | null>(null)
    const [isMounted, setIsMounted] = React.useState(false)
    const [ready, setReady] = React.useState(false)
    const [isFullscreen, setIsFullscreen] = React.useState(false)
    const [currentFontSize, setCurrentFontSize] = React.useState(fontSize)
    const [currentTheme, setCurrentTheme] = React.useState<TerminalTheme>(theme)
    const [dimensions, setDimensions] = React.useState({ cols, rows })

    React.useImperativeHandle(ref, () => ({
      write: (data) => termRef.current?.write(data),
      writeln: (data) => termRef.current?.writeln(data),
      clear: () => termRef.current?.clear(),
      reset: () => termRef.current?.reset(),
      focus: () => termRef.current?.focus(),
      blur: () => termRef.current?.blur(),
      getSelection: () => termRef.current?.getSelection() ?? "",
      getBufferText: () => {
        const term = termRef.current
        if (!term) return ""
        const lines: string[] = []
        for (let i = 0; i < term.buffer.active.length; i++) {
          lines.push(term.buffer.active.getLine(i)?.translateToString(true) ?? "")
        }
        return lines.join("\n")
      },
      resizeToFit: () => {
        fitRef.current?.fit()
        if (termRef.current) {
          setDimensions({ cols: termRef.current.cols, rows: termRef.current.rows })
        }
      },
    }), [])

    const handleResize = React.useCallback(() => {
      fitRef.current?.fit()
      const term = termRef.current
      if (term) {
        setDimensions({ cols: term.cols, rows: term.rows })
        onResize?.(term.cols, term.rows)
      }
    }, [onResize])

    React.useEffect(() => {
      setIsMounted(true)
      if (!containerRef.current) return
      const term = new XTerm({
        fontSize,
        fontFamily,
        cursorBlink,
        theme: currentTheme === "dark" ? darkTheme : lightTheme,
        allowProposedApi: true,
        disableStdin: disableStdin || readOnly,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current)
      fitRef.current = fit
      termRef.current = term

      const onDataDisposable = term.onData((data) => {
        if (!readOnly && !disableStdin && !disabled) {
          onData?.(data)
        }
      })
      const onResizeDisposable = term.onResize(({ cols, rows }) => {
        setDimensions({ cols, rows })
        onResize?.(cols, rows)
      })

      try {
        fit.fit()
      } catch {
        // container not measurable yet
      }

      if (initialText) {
        term.writeln(initialText)
      }
      if (autoFocus) {
        term.focus()
      }
      setReady(true)

      const ro = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          try {
            fit.fit()
          } catch {
            // ignore
          }
        })
      })
      if (containerRef.current) ro.observe(containerRef.current)

      return () => {
        ro.disconnect()
        onDataDisposable.dispose()
        onResizeDisposable.dispose()
        term.dispose()
        termRef.current = null
        fitRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMounted])

    React.useEffect(() => {
      if (!termRef.current) return
      termRef.current.options.fontSize = currentFontSize
      handleResize()
    }, [currentFontSize, handleResize])

    React.useEffect(() => {
      if (!termRef.current) return
      termRef.current.options.theme = currentTheme === "dark" ? darkTheme : lightTheme
    }, [currentTheme])

    React.useEffect(() => {
      if (!termRef.current) return
      termRef.current.options.cursorBlink = cursorBlink
    }, [cursorBlink])

    const handleCopy = async () => {
      const selection = termRef.current?.getSelection()
      if (selection) {
        await navigator.clipboard.writeText(selection)
      } else {
        const text = termRef.current ? terminalBufferToText(termRef.current) : ""
        if (text) await navigator.clipboard.writeText(text)
      }
    }

    const handleDownload = () => {
      const text = termRef.current ? terminalBufferToText(termRef.current) : ""
      if (onDownload) {
        onDownload(text)
      } else {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${title ?? "terminal"}.log`
        a.click()
        URL.revokeObjectURL(url)
      }
    }

    const toggleFullscreen = () => {
      setIsFullscreen((prev) => {
        const next = !prev
        requestAnimationFrame(() => handleResize())
        return next
      })
    }

    const statusLabel = {
      idle: "Idle",
      connecting: "Connecting",
      connected: "Connected",
      disconnected: "Disconnected",
      error: "Error",
    }[status]

    const statusClass = {
      idle: "bg-gray-400",
      connecting: "bg-yellow-400 animate-pulse",
      connected: "bg-emerald-500",
      disconnected: "bg-gray-400",
      error: "bg-red-500",
    }[status]

    return (
      <div
        data-slot="web-terminal"
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
              <div className={cn("size-2 shrink-0 rounded-full", statusClass)} />
              {title && <span className="truncate text-xs font-medium text-gray-300">{title}</span>}
              {ready && (
                <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                  {dimensions.cols}×{dimensions.rows}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentFontSize((f) => Math.max(f - 1, 8))}
                disabled={!ready}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                title="Decrease font size"
              >
                <MinusIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentFontSize((f) => Math.min(f + 1, 24))}
                disabled={!ready}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                title="Increase font size"
              >
                <PlusIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentTheme((t) => (t === "dark" ? "light" : "dark"))}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                title="Toggle theme"
              >
                <ClipboardIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!ready}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                title="Copy selection or buffer"
              >
                <CopyIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => termRef.current?.reset()}
                disabled={!ready}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                title="Reset terminal"
              >
                <RotateCcwIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  termRef.current?.clear()
                  onClear?.()
                }}
                disabled={!ready}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                title="Clear buffer"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                disabled={!ready}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                title="Download buffer"
              >
                <DownloadIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                disabled={!ready}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize2Icon className="size-3.5" /> : <Maximize2Icon className="size-3.5" />}
              </Button>
            </div>
          </div>
        )}

        <div
          className={cn(
            "relative min-h-0 flex-1",
            currentTheme === "dark" ? "bg-[#020617]" : "bg-white",
          )}
        >
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner className="size-5 text-gray-500" />
            </div>
          )}
          <div
            ref={containerRef}
            className={cn("p-2", !ready && "opacity-0")}
          />
        </div>

        {showStatusBar && (
          <div className="flex items-center justify-between gap-2 border-t border-gray-800 bg-gray-900/50 px-3 py-1.5">
            <Badge variant="outline" className="gap-1.5 border-gray-700 px-1.5 text-[11px] text-gray-400">
              <span className={cn("size-1.5 rounded-full", statusClass)} />
              {statusLabel}
            </Badge>
            <span className="text-[11px] text-gray-500">
              {readOnly ? "Read-only" : "Interactive"} · {currentFontSize}px
            </span>
          </div>
        )}
      </div>
    )
  },
)

function terminalBufferToText(term: XTerm): string {
  const lines: string[] = []
  for (let i = 0; i < term.buffer.active.length; i++) {
    lines.push(term.buffer.active.getLine(i)?.translateToString(true) ?? "")
  }
  return lines.join("\n")
}

export { WebTerminal }
export default WebTerminal
