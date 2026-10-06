"use client"

import * as React from "react"
import { cn } from "@/lib/utility"

export interface SlaGaugeProps extends React.ComponentProps<"div"> {
  value: number
  target?: number
  label?: string
  size?: number
  showTrend?: boolean
  trend?: "up" | "down" | "neutral"
}

function SlaGauge({
  value,
  target = 99.9,
  label,
  size = 160,
  showTrend,
  trend = "neutral",
  className,
  ...props
}: SlaGaugeProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100)
  const clampedTarget = Math.min(Math.max(target, 0), 100)
  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const startAngle = 135
  const endAngle = 405
  const totalAngle = endAngle - startAngle

  const progress = clampedValue / 100
  const targetProgress = clampedTarget / 100
  const arcLength = (totalAngle / 360) * circumference

  const strokeDashoffset = arcLength * (1 - progress)

  const center = size / 2

  const getColor = () => {
    if (clampedValue >= clampedTarget) return "var(--color-emerald-500)"
    if (clampedValue >= clampedTarget - 0.5) return "var(--color-yellow-500)"
    return "var(--color-red-500)"
  }

  const polarToCartesian = (angle: number) => {
    const rad = (angle - 90) * (Math.PI / 180)
    return {
      x: center + radius * Math.cos(rad),
      y: center + radius * Math.sin(rad),
    }
  }

  const largeArcFlag = totalAngle > 180 ? 1 : 0

  const start = polarToCartesian(startAngle)
  const end = polarToCartesian(endAngle)
  const targetAngle = startAngle + totalAngle * targetProgress
  const targetPos = polarToCartesian(targetAngle)

  const trackPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`

  const getSeverityLabel = () => {
    if (clampedValue >= 99) return "Excellent"
    if (clampedValue >= 95) return "Good"
    if (clampedValue >= 90) return "Fair"
    return "Critical"
  }

  const downtimeSeconds = Math.round(((100 - clampedValue) / 100) * 30 * 24 * 60 * 60)
  const formatDowntime = (sec: number) => {
    if (sec < 60) return `${sec}s`
    if (sec < 3600) return `${Math.floor(sec / 60)}m`
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`
    return `${Math.floor(sec / 86400)}d`
  }

  return (
    <div data-slot="sla-gauge" className={cn("flex flex-col items-center gap-2", className)} {...props}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path
            d={trackPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={12}
            className="text-muted opacity-10"
          />
          <path
            d={trackPath}
            fill="none"
            stroke={getColor()}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${getColor()}50)` }}
          />
          <circle
            cx={targetPos.x}
            cy={targetPos.y}
            r={5}
            fill="var(--color-background)"
            stroke={clampedValue >= clampedTarget ? "var(--color-emerald-500)" : "var(--color-muted-foreground)"}
            strokeWidth={2}
          />
          <circle
            cx={center}
            cy={center}
            r={4}
            fill={getColor()}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold tabular-nums"
            style={{ color: getColor() }}
          >
            {clampedValue.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">%</span>
          <span className="text-xs font-medium mt-1" style={{ color: getColor() }}>
            {getSeverityLabel()}
          </span>
        </div>
      </div>

      {label && <span className="text-sm font-medium text-muted-foreground">{label}</span>}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          Target: <span className="font-medium text-foreground">{clampedTarget.toFixed(1)}%</span>
        </span>
        {showTrend && (
          <span
            className={cn(
              "font-medium",
              trend === "up" && "text-emerald-500",
              trend === "down" && "text-red-500",
              trend === "neutral" && "text-muted-foreground"
            )}
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          </span>
        )}
        <span>
          Downtime: <span className="font-medium text-foreground">{formatDowntime(downtimeSeconds)}/mo</span>
        </span>
      </div>
    </div>
  )
}

export { SlaGauge }
