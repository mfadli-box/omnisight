"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { ChevronRightIcon, CopyIcon, CheckIcon } from "lucide-react"
import { Button } from "./button"

export interface JsonViewerProps extends React.ComponentProps<"div"> {
  data: unknown
  defaultExpanded?: boolean
  maxHeight?: number
  showCopy?: boolean
  sortKeys?: boolean
}

type JsonNodeProps = {
  nodeKey: string
  value: unknown
  depth: number
  isLast: boolean
  expanded: boolean
  onToggle: (path: string) => void
  path: string
  sortKeys: boolean
  defaultExpanded: boolean
}

const INDENT_SIZE = 2
const MAX_PREVIEW_LINES = 20

function JsonNode({
  nodeKey,
  value,
  depth,
  isLast,
  expanded,
  onToggle,
  path,
  sortKeys,
  defaultExpanded,
}: JsonNodeProps) {
  const isObject = typeof value === "object" && value !== null
  const isArray = Array.isArray(value)
  const isExpandable = isObject && (isArray ? (value as unknown[]).length > 0 : Object.keys(value as object).length > 0)

  const [localExpanded, setLocalExpanded] = React.useState(
    defaultExpanded || depth < 2
  )
  const effectiveExpanded = expanded && localExpanded

  const handleToggle = () => {
    if (isExpandable) {
      setLocalExpanded((prev) => !prev)
      onToggle(path)
    }
  }

  const renderValue = (val: unknown, key: string, idx: number, isLastItem: boolean): React.ReactNode => {
    const childPath = isArray ? `${path}[${idx}]` : `${path}.${key}`
    const childIsObject = typeof val === "object" && val !== null
    const childIsArray = Array.isArray(val)
    const childIsExpandable = childIsObject && (childIsArray ? (val as unknown[]).length > 0 : Object.keys(val as object).length > 0)

    if (!childIsObject) {
      return (
        <JsonNode
          nodeKey={childIsArray ? String(idx) : key}
          value={val}
          depth={depth + 1}
          isLast={isLastItem}
          expanded={effectiveExpanded}
          onToggle={onToggle}
          path={childPath}
          sortKeys={sortKeys}
          defaultExpanded={defaultExpanded}
        />
      )
    }

    if (!childIsExpandable) {
      return (
        <JsonNode
          nodeKey={childIsArray ? String(idx) : key}
          value={val}
          depth={depth + 1}
          isLast={isLastItem}
          expanded={effectiveExpanded}
          onToggle={onToggle}
          path={childPath}
          sortKeys={sortKeys}
          defaultExpanded={defaultExpanded}
        />
      )
    }

    return (
      <JsonNode
        nodeKey={childIsArray ? String(idx) : key}
        value={val}
        depth={depth + 1}
        isLast={isLastItem}
        expanded={effectiveExpanded}
        onToggle={onToggle}
        path={childPath}
        sortKeys={sortKeys}
        defaultExpanded={defaultExpanded}
      />
    )
  }

  const comma = isLast ? "" : ","

  if (!isObject) {
    return (
      <div className={cn("font-mono text-xs")}>
        {nodeKey && (
          <>
            <span className="text-muted-foreground">{`"${nodeKey}"`}</span>
            <span className="text-muted-foreground">: </span>
          </>
        )}
        {value === null && <span className="text-muted-foreground">null</span>}
        {value === undefined && <span className="text-muted-foreground">undefined</span>}
        {typeof value === "boolean" && <span className="text-yellow-500">{String(value)}</span>}
        {typeof value === "number" && <span className="text-sky-500">{String(value)}</span>}
        {typeof value === "string" && (
          <span className="text-emerald-400">{`"${value}"`}</span>
        )}
        <span className="text-muted-foreground">{comma}</span>
      </div>
    )
  }

  if (isArray) {
    const arr = value as unknown[]
    if (!localExpanded) {
      return (
        <div className={cn("font-mono text-xs")}>
          <span className="text-muted-foreground">{`"${nodeKey}"`}</span>
          <span className="text-muted-foreground">: </span>
          <button onClick={handleToggle} className="hover:text-foreground text-muted-foreground">
            <ChevronRightIcon className="inline size-3" />
          </button>
          <span className="text-muted-foreground">[{arr.length} items]</span>
          <span className="text-muted-foreground">{comma}</span>
        </div>
      )
    }
    return (
      <div className={cn("font-mono text-xs")}>
        <div>
          {nodeKey && (
            <>
              <span className="text-muted-foreground">{`"${nodeKey}"`}</span>
              <span className="text-muted-foreground">: </span>
            </>
          )}
          {isExpandable && (
            <button onClick={handleToggle} className="hover:text-foreground text-muted-foreground inline-flex items-center">
              <ChevronRightIcon
                className={cn("size-3 transition-transform", localExpanded && "rotate-90")}
              />
            </button>
          )}
          <span className="text-muted-foreground">[</span>
        </div>
        {localExpanded &&
          arr.map((item, idx) => (
            <div key={idx} style={{ paddingLeft: INDENT_SIZE }}>
              {renderValue(item, "", idx, idx === arr.length - 1)}
            </div>
          ))}
        <div className={cn("font-mono text-xs")}>
          <span className="text-muted-foreground">]{comma}</span>
        </div>
      </div>
    )
  }

  const obj = value as Record<string, unknown>
  const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj)

  if (!localExpanded) {
    return (
      <div className={cn("font-mono text-xs")}>
        <span className="text-muted-foreground">{`"${nodeKey}"`}</span>
        <span className="text-muted-foreground">: </span>
        <button onClick={handleToggle} className="hover:text-foreground text-muted-foreground">
          <ChevronRightIcon className="inline size-3" />
        </button>
        <span className="text-muted-foreground">{"{"}{keys.length}{"}"}</span>
        <span className="text-muted-foreground">{comma}</span>
      </div>
    )
  }

  return (
    <div className={cn("font-mono text-xs")}>
      <div>
        {nodeKey && (
          <>
            <span className="text-muted-foreground">{`"${nodeKey}"`}</span>
            <span className="text-muted-foreground">: </span>
          </>
        )}
        {isExpandable && (
          <button onClick={handleToggle} className="hover:text-foreground text-muted-foreground inline-flex items-center">
            <ChevronRightIcon
              className={cn("size-3 transition-transform", localExpanded && "rotate-90")}
            />
          </button>
        )}
        <span className="text-muted-foreground">{"{"}</span>
      </div>
      {localExpanded &&
        keys.map((k, idx) => (
          <div key={k} style={{ paddingLeft: INDENT_SIZE }}>
            {renderValue(obj[k], k, 0, idx === keys.length - 1)}
          </div>
        ))}
      <div className={cn("font-mono text-xs")}>
        <span className="text-muted-foreground">{"}"}{comma}</span>
      </div>
    </div>
  )
}

function JsonPreview({ data }: { data: unknown }) {
  const lines = JSON.stringify(data, null, 2).split("\n")
  const preview = lines.length > MAX_PREVIEW_LINES
    ? lines.slice(0, MAX_PREVIEW_LINES).join("\n") + "\n..."
    : JSON.stringify(data, null, 2)
  return (
    <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-all">
      {preview}
    </pre>
  )
}

function JsonViewer({
  data,
  defaultExpanded = false,
  maxHeight,
  showCopy = true,
  sortKeys = false,
  className,
  ...props
}: JsonViewerProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const [copied, setCopied] = React.useState(false)

  const handleToggle = React.useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      //
    }
  }

  const isLarge = React.useMemo(() => {
    const str = JSON.stringify(data)
    return str.length > 5000
  }, [data])

  return (
    <div
      data-slot="json-viewer"
      className={cn("rounded-md border bg-gray-950 text-gray-100", className)}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <span className="text-xs text-gray-500">
          {Array.isArray(data) ? `Array[${data.length}]` : typeof data === "object" && data !== null ? `Object{${Object.keys(data).length}}` : typeof data}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((p) => !p)}
            className="h-7 px-2 text-xs text-gray-500 hover:text-gray-300"
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
          {showCopy && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2 text-xs text-gray-500 hover:text-gray-300"
            >
              {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-auto p-3" style={maxHeight ? { maxHeight } : undefined}>
        {isLarge && !expanded ? (
          <JsonPreview data={data} />
        ) : (
          <JsonNode
            nodeKey=""
            value={data}
            depth={0}
            isLast
            expanded={expanded}
            onToggle={handleToggle}
            path="$"
            sortKeys={sortKeys}
            defaultExpanded={defaultExpanded}
          />
        )}
      </div>
    </div>
  )
}

export { JsonViewer }
