"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { ScrollArea } from "./scroll-area"
import { Button } from "./button"
import { DownloadIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react"

export interface TerminalLine {
  type?: "stdout" | "stderr" | "system" | "prompt" | "command"
  timestamp?: string
  content: string
}

export interface TerminalProps extends React.ComponentProps<"div"> {
  lines?: TerminalLine[]
  onDownload?: () => void
  onClear?: () => void
  autoScroll?: boolean
  showTimestamps?: boolean
  showScrollControls?: boolean
  title?: string
  status?: "running" | "success" | "error" | "idle"
  maxHeight?: number
}

function TerminalLineComponent({
  line,
  showTimestamp,
}: {
  line: TerminalLine
  showTimestamp: boolean
}) {
  const getLineClass = () => {
    switch (line.type) {
      case "stderr":
        return "text-red-400"
      case "system":
        return "text-blue-400"
      case "prompt":
        return "text-emerald-400"
      case "command":
        return "text-yellow-400"
      default:
        return "text-gray-100"
    }
  }

  const getPrefix = () => {
    switch (line.type) {
      case "stderr":
        return "[ERROR]"
      case "system":
        return "[SYS]"
      case "prompt":
        return "$"
      case "command":
        return ">"
      default:
        return ""
    }
  }

  return (
    <div className={cn("flex gap-2 py-0.5 hover:bg-gray-900/50", getLineClass())}>
      {showTimestamp && line.timestamp && (
        <span className="text-gray-600 shrink-0 text-xs font-mono">{line.timestamp}</span>
      )}
      {getPrefix() && (
        <span className="shrink-0 font-mono font-bold">{getPrefix()}</span>
      )}
      <span className="font-mono text-sm whitespace-pre-wrap break-all flex-1">
        {line.content}
      </span>
    </div>
  )
}

function Terminal({
  lines = [],
  onDownload,
  onClear,
  autoScroll = true,
  showTimestamps = false,
  showScrollControls = true,
  title,
  status = "idle",
  maxHeight = 400,
  className,
  ...props
}: TerminalProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = React.useState(true)
  const [autoScrollEnabled, setAutoScrollEnabled] = React.useState(autoScroll)

  React.useEffect(() => {
    if (autoScrollEnabled && isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScrollEnabled, isAtBottom])

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const atBottom = scrollHeight - scrollTop - clientHeight < 50
      setIsAtBottom(atBottom)
      if (atBottom) setAutoScrollEnabled(true)
    }
  }

  const scrollTo = (direction: "top" | "bottom") => {
    if (scrollRef.current) {
      if (direction === "top") {
        scrollRef.current.scrollTop = 0
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
      setAutoScrollEnabled(direction === "bottom")
    }
  }

  const statusColor = {
    running: "bg-blue-500",
    success: "bg-emerald-500",
    error: "bg-red-500",
    idle: "bg-gray-500",
  }[status]

  return (
    <div
      data-slot="terminal"
      className={cn("flex flex-col rounded-md border bg-gray-950 text-gray-100 overflow-hidden", className)}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className={cn("size-2 rounded-full", statusColor, status === "running" && "animate-pulse")} />
          {title && <span className="text-xs font-medium text-gray-400">{title}</span>}
          {status === "running" && <span className="text-xs text-blue-400">Running...</span>}
          {status === "success" && <span className="text-xs text-emerald-400">Completed</span>}
          {status === "error" && <span className="text-xs text-red-400">Failed</span>}
        </div>
        <div className="flex items-center gap-1">
          {showScrollControls && lines.length > 10 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollTo("top")}
                disabled={!isAtBottom}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
              >
                <ChevronUpIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollTo("bottom")}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
              >
                <ChevronDownIcon className="size-3.5" />
              </Button>
            </>
          )}
          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
            >
              <TrashIcon className="size-3.5" />
            </Button>
          )}
          {onDownload && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDownload}
              className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
            >
              <DownloadIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1"
        style={{ maxHeight }}
      >
        <div className="p-3 space-y-0">
          {lines.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              No output yet
            </div>
          ) : (
            lines.map((line, index) => (
              <TerminalLineComponent
                key={index}
                line={line}
                showTimestamp={showTimestamps}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {!isAtBottom && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollTo("bottom")}
            className="h-7 gap-1.5 text-xs shadow-lg"
          >
            <ChevronDownIcon className="size-3.5" />
            Scroll to bottom
          </Button>
        </div>
      )}
    </div>
  )
}

export { Terminal }
