"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { Button } from "./button"
import { Spinner } from "./spinner"
import { Badge } from "./badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./card"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "./empty"
import { formatBitsPerSec, formatDuration, formatUptime } from "@/lib/format"
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  Link2Icon,
  LockIcon,
  NetworkIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldCheckIcon,
  SignalIcon,
  WifiIcon,
} from "lucide-react"

export type VpnState = "up" | "down" | "connecting" | "error"

export interface VpnTunnel {
  name: string
  status: VpnState
  protocol?: string
  local?: string
  remote?: string
  connectedAt?: string
  durationMs?: number
  rxBps?: number
  txBps?: number
  mtu?: number
  latencyMs?: number
  packetLoss?: number
  uptimeSeconds?: number
}

export interface VpnPeer {
  name: string
  address?: string
  publicKey?: string
  endpoint?: string
  latestHandshake?: string
  rxBytes?: number
  txBytes?: number
  allowedIps?: string[]
  keepaliveSeconds?: number
  online?: boolean
}

export interface VpnStatusProps extends React.ComponentProps<"div"> {
  title?: string
  loading?: boolean
  error?: string | null
  tunnels?: VpnTunnel[]
  peers?: VpnPeer[]
  activeTunnels?: number
  totalTunnels?: number
  defaultMode?: "overview" | "peers"
  onRefresh?: () => void
  onToggleTunnel?: (tunnel: VpnTunnel) => void
  className?: string
}

const VpnStatus = React.forwardRef<HTMLDivElement, VpnStatusProps>(function VpnStatus(
  {
    title = "VPN Status",
    loading = false,
    error = null,
    tunnels = [],
    peers = [],
    activeTunnels,
    totalTunnels,
    defaultMode = "overview",
    onRefresh,
    onToggleTunnel,
    className,
    ...props
  },
  ref,
) {
  const [mode, setMode] = React.useState<"overview" | "peers">(defaultMode)
  const active = activeTunnels ?? tunnels.filter((t) => t.status === "up").length
  const total = totalTunnels ?? tunnels.length
  const onlinePeers = peers.filter((p) => p.online).length

  return (
    <div
      ref={ref}
      data-slot="vpn-status"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4 text-emerald-500" />
          <span className="text-sm font-medium">{title}</span>
          {!loading && tunnels.length > 0 && (
            <Badge variant={active === total ? "default" : "secondary"} className="text-[10px]">
              {active}/{total} up
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("overview")}
            data-active={mode === "overview"}
            className="h-6 px-2 text-xs data-[active=true]:bg-muted data-[active=true]:text-foreground"
          >
            Tunnels
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("peers")}
            data-active={mode === "peers"}
            className="h-6 px-2 text-xs data-[active=true]:bg-muted data-[active=true]:text-foreground"
          >
            Peers {peers.length > 0 && `(${onlinePeers}/${peers.length})`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="h-6 w-6 p-0 text-muted-foreground"
          >
            <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <Empty className="py-6">
          <EmptyMedia variant="icon">
            <NetworkIcon className="size-4" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Failed to load VPN status</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {loading && tunnels.length === 0 && peers.length === 0 && (
        <div className="flex items-center justify-center py-10">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      )}

      {mode === "overview" && !error && (
        <div className="grid gap-3">
          {tunnels.length === 0 && !loading && (
            <Empty className="py-6">
              <EmptyMedia variant="icon">
                <Link2Icon className="size-4" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No tunnels configured</EmptyTitle>
                <EmptyDescription>VPN tunnels will appear here once configured.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {tunnels.map((tunnel) => (
            <Card key={tunnel.name} size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TunnelIcon state={tunnel.status} />
                  <span className="truncate">{tunnel.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto text-[10px]",
                      tunnel.status === "up" && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                      tunnel.status === "down" && "border-gray-300 text-gray-500 dark:border-gray-700",
                      tunnel.status === "connecting" && "border-yellow-500/30 text-yellow-600 dark:text-yellow-400",
                      tunnel.status === "error" && "border-red-500/30 text-red-600 dark:text-red-400",
                    )}
                  >
                    {tunnel.status.toUpperCase()}
                  </Badge>
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  {tunnel.protocol && (
                    <span className="rounded bg-muted px-1 py-px text-[10px]">{tunnel.protocol}</span>
                  )}
                  {tunnel.local && (
                    <span className="flex items-center gap-1 truncate text-xs">
                      <ArrowUpIcon className="size-3" />
                      {tunnel.local}
                    </span>
                  )}
                  {tunnel.remote && (
                    <span className="flex items-center gap-1 truncate text-xs">
                      <ArrowDownIcon className="size-3" />
                      {tunnel.remote}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Metric label="Uptime" value={tunnel.durationMs ? formatDuration(tunnel.durationMs) : tunnel.uptimeSeconds != null ? formatUptime(tunnel.uptimeSeconds) : "—"} />
                <Metric label="RX rate" value={tunnel.rxBps != null ? formatBitsPerSec(tunnel.rxBps) : "—"} />
                <Metric label="TX rate" value={tunnel.txBps != null ? formatBitsPerSec(tunnel.txBps) : "—"} />
                <Metric
                  label="Latency"
                  value={
                    tunnel.latencyMs != null
                      ? `${tunnel.latencyMs.toFixed(0)} ms${tunnel.packetLoss != null ? ` / ${tunnel.packetLoss.toFixed(1)}% loss` : ""}`
                      : "—"
                  }
                />
              </CardContent>
              {onToggleTunnel && (
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleTunnel(tunnel)}
                    className="h-6 text-xs"
                  >
                    {tunnel.status === "up" ? "Disconnect" : tunnel.status === "connecting" ? "Cancel" : "Connect"}
                  </Button>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {mode === "peers" && !error && (
        <div className="grid gap-3">
          {peers.length === 0 && !loading && (
            <Empty className="py-6">
              <EmptyMedia variant="icon">
                <WifiIcon className="size-4" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No peers found</EmptyTitle>
                <EmptyDescription>WireGuard peers will appear here once configured.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {peers.map((peer) => (
            <Card key={peer.name} size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <SignalIcon
                    className={cn(
                      "size-4",
                      peer.online ? "text-emerald-500" : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate">{peer.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto text-[10px]",
                      peer.online
                        ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "border-gray-300 text-gray-500 dark:border-gray-700",
                    )}
                  >
                    {peer.online ? "ONLINE" : "OFFLINE"}
                  </Badge>
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <ServerIcon className="size-3" />
                  <span className="truncate text-xs">{peer.endpoint ?? peer.address ?? "—"}</span>
                  {peer.publicKey && (
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                      {shortKey(peer.publicKey)}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Metric label="Handshake" value={peer.latestHandshake ?? "—"} />
                <Metric label="RX" value={peer.rxBytes != null ? formatBytes2(peer.rxBytes) : "—"} />
                <Metric label="TX" value={peer.txBytes != null ? formatBytes2(peer.txBytes) : "—"} />
                <Metric label="Keepalive" value={peer.keepaliveSeconds != null ? `${peer.keepaliveSeconds}s` : "—"} />
              </CardContent>
              {peer.allowedIps && peer.allowedIps.length > 0 && (
                <CardContent className="flex flex-wrap gap-1">
                  {peer.allowedIps.map((ip) => (
                    <span key={ip} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {ip}
                    </span>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
})

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="truncate font-medium tabular-nums">{value}</span>
    </div>
  )
}

function TunnelIcon({ state }: { state: VpnState }) {
  switch (state) {
    case "up":
      return <ActivityIcon className="size-4 text-emerald-500" />
    case "connecting":
      return <ClockIcon className="size-4 animate-pulse text-yellow-500" />
    case "error":
      return <NetworkIcon className="size-4 text-red-500" />
    default:
      return <LockIcon className="size-4 text-muted-foreground" />
  }
}

function shortKey(key: string): string {
  if (!key) return ""
  return `${key.slice(0, 10)}…${key.slice(-6)}`
}

function formatBytes2(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KiB", "MiB", "GiB", "TiB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export { VpnStatus, formatBytes2 }
export default VpnStatus
