'use client'

/**
 * Kartu metrik NOC (CPU/RAM/Disk): nilai terakhir + Progress + sparkline
 * SVG murni (tanpa dependency chart). Data dari snapshot telemetri.
 */

import { Progress } from '@/presentation/components/ui/progress'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card'

export interface MetricCardProps {
  label: string
  /** Persentase 0–100 (null = data belum tersedia). */
  percent: number | null
  /** Rincian teks (mis. "64 GiB / 128 GiB"). */
  detail: string
  /** Riwayat persentase (tertua → terbaru) untuk sparkline. */
  history: number[]
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const width = 240
  const height = 40
  const max = Math.max(100, ...values)
  const step = width / (values.length - 1)
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 h-10 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Riwayat metrik"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary"
      />
    </svg>
  )
}

export function MetricCard({ label, percent, detail, history }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="text-2xl font-semibold tabular-nums">
          {percent === null ? '—' : `${percent.toFixed(1)}%`}
        </div>
        <CardDescription className="text-xs">{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <Progress value={percent ?? 0} />
        <Sparkline values={history} />
      </CardContent>
    </Card>
  )
}
