"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { Button } from "./button"
import { Spinner } from "./spinner"
import { Badge } from "./badge"
import { Input } from "./input"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GlobeIcon,
  LockIcon,
  LockOpenIcon,
  Maximize2Icon,
  Minimize2Icon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldIcon,
  XIcon,
} from "lucide-react"

export interface WebappProxyProps extends Omit<React.ComponentProps<"div">, "onError"> {
  src?: string
  title?: string
  status?: "idle" | "loading" | "ready" | "blocked" | "error"
  blockedReason?: string
  sslVerify?: boolean
  showToolbar?: boolean
  showAddressBar?: boolean
  showStatusBar?: boolean
  readOnly?: boolean
  onNavigation?: (url: string) => void
  onLoaded?: (url: string) => void
  onError?: (error: Error) => void
  className?: string
}

const WebappProxy = React.forwardRef<HTMLDivElement, WebappProxyProps>(function WebappProxy(
  {
    src,
    title = "Web App",
    status: controlledStatus,
    blockedReason,
    sslVerify = true,
    showToolbar = true,
    showAddressBar = true,
    showStatusBar = true,
    readOnly = false,
    onNavigation,
    onLoaded,
    onError,
    className,
    ...props
  },
  ref,
) {
  const [internalStatus, setInternalStatus] = React.useState<WebappProxyProps["status"]>("idle")
  const [internalSrc, setInternalSrc] = React.useState<string | undefined>(src)
  const [address, setAddress] = React.useState<string>(src ?? "")
  const [canGoBack, setCanGoBack] = React.useState(false)
  const [canGoForward, setCanGoForward] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const historyRef = React.useRef<string[]>([])
  const historyIndexRef = React.useRef(-1)

  const status = controlledStatus ?? internalStatus
  const currentSrc = internalSrc ?? src

  const setStatus = React.useCallback(
    (next: NonNullable<WebappProxyProps["status"]>) => {
      if (controlledStatus === undefined) setInternalStatus(next)
    },
    [controlledStatus],
  )

  const commitNavigation = React.useCallback(
    (url: string) => {
      const prev = historyRef.current
      if (prev[historyIndexRef.current] === url) return
      historyRef.current = prev.slice(0, historyIndexRef.current + 1)
      historyRef.current.push(url)
      historyIndexRef.current = historyRef.current.length - 1
      setCanGoBack(historyIndexRef.current > 0)
      setCanGoForward(historyIndexRef.current < historyRef.current.length - 1)
      setInternalSrc(url)
      setAddress(url)
      setStatus("loading")
      onNavigation?.(url)
    },
    [onNavigation, setStatus],
  )

  const handleNavigate = React.useCallback(
    (url: string) => {
      if (readOnly) return
      const resolved = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`
      commitNavigation(resolved)
    },
    [commitNavigation, readOnly],
  )

  const handleGoBack = React.useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1
      const target = historyRef.current[historyIndexRef.current]
      setInternalSrc(target)
      setAddress(target)
      setCanGoBack(historyIndexRef.current > 0)
      setCanGoForward(true)
      setStatus("loading")
    }
  }, [setStatus])

  const handleGoForward = React.useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1
      const target = historyRef.current[historyIndexRef.current]
      setInternalSrc(target)
      setAddress(target)
      setCanGoForward(historyIndexRef.current < historyRef.current.length - 1)
      setCanGoBack(true)
      setStatus("loading")
    }
  }, [setStatus])

  React.useEffect(() => {
    if (src && src !== historyRef.current[historyIndexRef.current]) {
      historyRef.current = [src]
      historyIndexRef.current = 0
      setCanGoBack(false)
      setCanGoForward(false)
      setInternalSrc(src)
      setAddress(src)
      if (status === "idle") setStatus("loading")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const handleLoad = () => {
    setStatus("ready")
    onLoaded?.(address)
  }

  const handleError = () => {
    setStatus("error")
    onError?.(new Error(`Failed to load ${address}`))
  }

  const addressBarHost = React.useMemo(() => {
    try {
      return currentSrc ? new URL(currentSrc).host : title
    } catch {
      return title
    }
  }, [currentSrc, title])

  const statusMeta: Record<string, { label: string; dot: string }> = {
    idle: { label: "Idle", dot: "bg-gray-400" },
    loading: { label: "Loading", dot: "bg-yellow-400 animate-pulse" },
    ready: { label: "Ready", dot: "bg-emerald-500" },
    blocked: { label: "Blocked", dot: "bg-red-500" },
    error: { label: "Error", dot: "bg-red-500" },
  }

  return (
    <div
      ref={ref}
      data-slot="webapp-proxy"
      className={cn(
        "flex flex-col overflow-hidden rounded-md border bg-background",
        isFullscreen && "fixed inset-0 z-50 rounded-none border-0",
        className,
      )}
      {...props}
    >
      {showToolbar && (
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {sslVerify ? (
              <ShieldCheckIcon className="size-4 shrink-0 text-emerald-500" />
            ) : (
              <ShieldIcon className="size-4 shrink-0 text-yellow-500" />
            )}
            <span className="truncate text-xs font-medium">{title}</span>
            {!sslVerify && (
              <Badge variant="outline" className="text-[10px] text-yellow-600 dark:text-yellow-400">
                SSL verify off
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => iframeRef.current?.contentWindow?.location.reload()}
              disabled={!currentSrc || status === "loading"}
              className="h-6 w-6 p-0 text-muted-foreground"
            >
              <RefreshCwIcon className={cn("size-3.5", status === "loading" && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen((v) => !v)}
              className="h-6 w-6 p-0 text-muted-foreground"
            >
              {isFullscreen ? <Minimize2Icon className="size-3.5" /> : <Maximize2Icon className="size-3.5" />}
            </Button>
          </div>
        </div>
      )}

      {showAddressBar && (
        <div className="flex items-center gap-1.5 border-b bg-muted/20 px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoBack}
            disabled={!canGoBack || readOnly}
            className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoForward}
            disabled={!canGoForward || readOnly}
            className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
          >
            <ArrowRightIcon className="size-3.5" />
          </Button>
          <div className="relative flex min-w-0 flex-1 items-center">
            <GlobeIcon className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
            {readOnly ? (
              <span className="truncate pl-7 text-xs text-muted-foreground">{addressBarHost}</span>
            ) : (
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && address.trim()) handleNavigate(address.trim())
                }}
                placeholder="https://webapp.example.com"
                className="h-6 pl-7 text-xs"
              />
            )}
            {readOnly && sslVerify && (
              <LockIcon className="absolute right-2 size-3 text-emerald-500" />
            )}
            {readOnly && !sslVerify && (
              <LockOpenIcon className="absolute right-2 size-3 text-yellow-500" />
            )}
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-white">
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        )}
        {status === "blocked" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background p-6 text-center">
            <ShieldIcon className="size-8 text-red-500" />
            <p className="text-sm font-medium">Access blocked</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {blockedReason ?? "This web application is not allowed for your current permission."}
            </p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background p-6 text-center">
            <XIcon className="size-8 text-red-500" />
            <p className="text-sm font-medium">Failed to load</p>
            <p className="max-w-sm text-xs text-muted-foreground">{address}</p>
          </div>
        )}
        {currentSrc ? (
          <iframe
            ref={iframeRef}
            src={currentSrc}
            sandbox={readOnly ? "allow-scripts allow-same-origin" : undefined}
            onLoad={handleLoad}
            onError={handleError}
            className="size-full border-0"
            title={title}
            data-slot="webapp-proxy-frame"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <GlobeIcon className="size-8" />
            <p className="text-xs">No web app URL configured</p>
          </div>
        )}
      </div>

      {showStatusBar && (
        <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-3 py-1.5">
          <Badge variant="outline" className="gap-1.5 px-1.5 text-[11px]">
            <span className={cn("size-1.5 rounded-full", statusMeta[status ?? "idle"].dot)} />
            {statusMeta[status ?? "idle"].label}
          </Badge>
          <span className="truncate text-[11px] text-muted-foreground">{addressBarHost}</span>
        </div>
      )}
    </div>
  )
})

export { WebappProxy }
export default WebappProxy
