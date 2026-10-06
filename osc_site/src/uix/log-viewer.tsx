"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { ScrollArea } from "./scroll-area"
import { Input } from "./input"
import { SearchIcon, DownloadIcon, WrapTextIcon } from "lucide-react"

export interface LogEntry {
  timestamp?: string
  level?: "info" | "warn" | "error" | "debug"
  message: string
  source?: string
}

export interface LogViewerProps extends React.ComponentProps<"div"> {
  entries: LogEntry[]
  autoScroll?: boolean
  showSearch?: boolean
  showDownload?: boolean
  showLevelFilter?: boolean
  maxHeight?: number
  onDownload?: () => void
}

function LogViewer({
  className,
  entries,
  autoScroll = true,
  showSearch = true,
  showDownload = false,
  showLevelFilter = true,
  maxHeight = 400,
  onDownload,
  ...props
}: LogViewerProps) {
  const [search, setSearch] = React.useState("")
  const [levelFilter, setLevelFilter] = React.useState<Set<string>>(new Set())
  const [wrap, setWrap] = React.useState(true)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const filteredEntries = React.useMemo(() => {
    return entries.filter((entry) => {
      if (levelFilter.size > 0 && entry.level && !levelFilter.has(entry.level)) {
        return false
      }
      if (search && !entry.message.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      return true
    })
  }, [entries, search, levelFilter])

  React.useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const el = scrollRef.current
      el.scrollTop = el.scrollHeight
    }
  }, [filteredEntries, autoScroll])

  const toggleLevel = (level: string) => {
    setLevelFilter((prev) => {
      const next = new Set(prev)
      if (next.has(level)) {
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }

  return (
    <div data-slot="log-viewer" className={cn("flex flex-col rounded-md border bg-gray-950 text-gray-100", className)} {...props}>
      {(showSearch || showLevelFilter || showDownload) && (
        <div className="flex items-center gap-2 border-b border-gray-800 p-2">
          {showSearch && (
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-gray-500" />
              <Input
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 pl-7 bg-gray-900 border-gray-700 text-gray-100 placeholder:text-gray-500"
              />
            </div>
          )}
          {showLevelFilter && (
            <div className="flex gap-1">
              {(["info", "warn", "error", "debug"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggleLevel(level)}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded font-medium transition-colors",
                    levelFilter.has(level) && "opacity-40",
                    level === "info" && "text-blue-400",
                    level === "warn" && "text-yellow-400",
                    level === "error" && "text-red-400",
                    level === "debug" && "text-gray-400"
                  )}
                >
                  {level.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setWrap(!wrap)}
            className={cn("p-1 rounded hover:bg-gray-800 text-gray-400", wrap && "text-gray-100")}
            title={wrap ? "Disable wrap" : "Enable wrap"}
          >
            <WrapTextIcon className="size-3.5" />
          </button>
          {showDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="p-1 rounded hover:bg-gray-800 text-gray-400"
              title="Download logs"
            >
              <DownloadIcon className="size-3.5" />
            </button>
          )}
        </div>
      )}
      <ScrollArea
        ref={scrollRef}
        className="font-mono text-xs"
        style={{ maxHeight }}
      >
        <div className="p-2">
          {filteredEntries.length === 0 ? (
            <div className="text-gray-500 text-center py-4">No log entries</div>
          ) : (
            <pre className={cn("whitespace-pre", wrap ? "break-words" : "overflow-x-auto")}>
              {filteredEntries.map((entry, index) => (
                <div key={index} className="flex gap-2 hover:bg-gray-900/50">
                  {entry.timestamp && (
                    <span className="text-gray-500 shrink-0">{entry.timestamp}</span>
                  )}
                  {entry.level && (
                    <span
                      className={cn(
                        "shrink-0 font-medium",
                        entry.level === "info" && "text-blue-400",
                        entry.level === "warn" && "text-yellow-400",
                        entry.level === "error" && "text-red-400",
                        entry.level === "debug" && "text-gray-400"
                      )}
                    >
                      [{entry.level.toUpperCase()}]
                    </span>
                  )}
                  {entry.source && (
                    <span className="text-gray-500 shrink-0">{entry.source}</span>
                  )}
                  <span className="flex-1 min-w-0">{entry.message}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export { LogViewer }
