"use client"

import * as React from "react"
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "./chart"
import { cn } from "@/lib/utility"

export interface AreaChartDataPoint {
  timestamp: string
  [key: string]: string | number
}

export interface AreaChartProps extends React.ComponentProps<"div"> {
  data: AreaChartDataPoint[]
  xAxisKey: string
  series: Array<{
    dataKey: string
    label: string
    color: string
    stackId?: string
  }>
  config?: ChartConfig
  height?: number
  showGrid?: boolean
  showLegend?: boolean
  showTooltip?: boolean
  unit?: string
  stack?: boolean
}

function AreaChart({
  data,
  xAxisKey,
  series,
  config = {},
  height = 200,
  showGrid = true,
  showLegend = true,
  showTooltip = true,
  unit,
  stack = false,
  className,
  ...props
}: AreaChartProps) {
  const chartConfig: ChartConfig = React.useMemo(() => {
    const merged = { ...config }
    for (const s of series) {
      if (!merged[s.dataKey]) {
        merged[s.dataKey] = { label: s.label, color: s.color }
      }
    }
    return merged
  }, [config, series])

  return (
    <div data-slot="area-chart" className={cn("w-full", className)} {...props}>
      <ChartContainer config={chartConfig} className={cn("w-full")} style={{ height }}>
        <ResponsiveContainer>
          <RechartsAreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-border/50"
              />
            )}
            <XAxis
              dataKey={xAxisKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) => (unit ? `${v}${unit}` : v)}
              className="text-xs fill-muted-foreground"
            />
            {showTooltip && (
              <Tooltip
                content={<ChartTooltipContent indicator="dot" />}
                cursor={{ stroke: "currentColor", strokeDasharray: "4 4" }}
              />
            )}
            {showLegend && (
              <Legend
                verticalAlign="top"
                height={36}
                wrapperStyle={{ fontSize: "12px" }}
              />
            )}
            {series.map((s) => (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.2}
                stackId={stack ? "stack" : undefined}
              />
            ))}
          </RechartsAreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
}

export { AreaChart }
