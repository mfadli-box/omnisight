"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { ScrollArea } from "./scroll-area"
import { Badge } from "./badge"
import { Button } from "./button"
import { DownloadIcon } from "lucide-react"

export interface DiffLine {
  type: "added" | "removed" | "unchanged" | "changed"
  oldLineNum?: number
  newLineNum?: number
  content: string
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

function computeDiff(oldText: string, newText: string): DiffHunk[] {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")

  const lcs: number[][] = Array.from({ length: oldLines.length + 1 }, () =>
    new Array(newLines.length + 1).fill(0)
  )
  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
      }
    }
  }

  const hunks: DiffHunk[] = []
  let i = oldLines.length
  let j = newLines.length
  let currentHunk: DiffLine[] = []
  let oldStart = oldLines.length
  let newStart = newLines.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      if (currentHunk.length > 0) {
        const oldHunkLines = currentHunk.filter((l) => l.type !== "added").length
        const newHunkLines = currentHunk.filter((l) => l.type !== "removed").length
        hunks.unshift({
          oldStart: oldStart - oldHunkLines + 1,
          oldLines: oldHunkLines,
          newStart: newStart - newHunkLines + 1,
          newLines: newHunkLines,
          lines: currentHunk,
        })
        currentHunk = []
        oldStart = i - 1
        newStart = j - 1
      }
      currentHunk.unshift({
        type: "unchanged",
        oldLineNum: i,
        newLineNum: j,
        content: oldLines[i - 1],
      })
      i--
      j--
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      if (currentHunk.length === 0) {
        oldStart = i
        newStart = j
      }
      currentHunk.unshift({
        type: "added",
        newLineNum: j,
        content: newLines[j - 1],
      })
      j--
    } else {
      if (currentHunk.length === 0) {
        oldStart = i
        newStart = j
      }
      currentHunk.unshift({
        type: "removed",
        oldLineNum: i,
        content: oldLines[i - 1],
      })
      i--
    }
  }

  if (currentHunk.length > 0) {
    const oldHunkLines = currentHunk.filter((l) => l.type !== "added").length
    const newHunkLines = currentHunk.filter((l) => l.type !== "removed").length
    hunks.unshift({
      oldStart: oldStart - oldHunkLines + 1,
      oldLines: oldHunkLines,
      newStart: newStart - newHunkLines + 1,
      newLines: newHunkLines,
      lines: currentHunk,
    })
  }

  return hunks
}

export interface DiffViewerProps extends React.ComponentProps<"div"> {
  oldContent?: string
  newContent?: string
  oldLabel?: string
  newLabel?: string
  showLineNumbers?: boolean
  showDiffSummary?: boolean
  onDownload?: () => void
}

function DiffViewer({
  oldContent = "",
  newContent = "",
  oldLabel = "Previous",
  newLabel = "Current",
  showLineNumbers = true,
  showDiffSummary = true,
  onDownload,
  className,
  ...props
}: DiffViewerProps) {
  const hunks = React.useMemo(
    () => computeDiff(oldContent, newContent),
    [oldContent, newContent]
  )

  const addedCount = hunks.reduce(
    (acc, h) => acc + h.lines.filter((l) => l.type === "added").length,
    0
  )
  const removedCount = hunks.reduce(
    (acc, h) => acc + h.lines.filter((l) => l.type === "removed").length,
    0
  )

  const getLineClass = (type: DiffLine["type"]) => {
    switch (type) {
      case "added":
        return "bg-emerald-950/50 text-emerald-400"
      case "removed":
        return "bg-red-950/50 text-red-400"
      case "changed":
        return "bg-yellow-950/50 text-yellow-400"
      default:
        return "text-foreground"
    }
  }

  const getPrefix = (type: DiffLine["type"]) => {
    switch (type) {
      case "added":
        return "+"
      case "removed":
        return "-"
      case "changed":
        return "~"
      default:
        return " "
    }
  }

  if (!oldContent && !newContent) {
    return (
      <div className={cn("flex items-center justify-center h-32 text-muted-foreground text-sm", className)} {...props}>
        No content to compare
      </div>
    )
  }

  return (
    <div data-slot="diff-viewer" className={cn("flex flex-col rounded-md border", className)} {...props}>
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          {showDiffSummary && (
            <>
              <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30">
                +{addedCount}
              </Badge>
              <Badge variant="outline" className="text-red-600 dark:text-red-400 border-red-600/30 dark:border-red-400/30">
                -{removedCount}
              </Badge>
            </>
          )}
          <span className="text-xs text-muted-foreground">
            {oldLabel} → {newLabel}
          </span>
        </div>
        {onDownload && (
          <Button variant="ghost" size="sm" onClick={onDownload} className="h-7 gap-1.5">
            <DownloadIcon className="size-3.5" />
            <span className="text-xs">Download</span>
          </Button>
        )}
      </div>

      <ScrollArea className="max-h-[600px]">
        <pre className="font-mono text-xs leading-5">
          {hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx}>
              <div className="sticky top-0 z-10 bg-muted/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
              </div>
              {hunk.lines.map((line, lineIdx) => (
                <div
                  key={`${hunkIdx}-${lineIdx}`}
                  className={cn("flex min-h-5 hover:bg-muted/50", getLineClass(line.type))}
                >
                  {showLineNumbers && (
                    <>
                      <span className="w-12 shrink-0 select-none border-r border-r-border/50 text-right pr-2 text-muted-foreground/50">
                        {line.oldLineNum ?? ""}
                      </span>
                      <span className="w-12 shrink-0 select-none border-r border-r-border/50 text-right pr-2 text-muted-foreground/50">
                        {line.newLineNum ?? ""}
                      </span>
                    </>
                  )}
                  <span className="w-6 shrink-0 select-none text-center font-bold">
                    {getPrefix(line.type)}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-all px-1">
                    {line.content || " "}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </pre>
      </ScrollArea>
    </div>
  )
}

export { DiffViewer }
