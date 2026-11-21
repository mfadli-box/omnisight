"use client";

import { useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type MetricPoint = { time: number; value: number | null };

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const clock = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const chartHeight = 92;

export function MetricChart({ title, unit, points, max }: {
  title: string; unit: string; points: MetricPoint[]; max?: number;
}) {
  const values = points.flatMap(({ value }) => value === null ? [] : [value]);
  const low = Math.min(0, ...values);
  const high = max ?? Math.max(low + 1, ...values);
  const first = points[0].time;
  const last = points[points.length - 1];
  const draw = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || values.length === 0) return;
    function paint() {
      if (!canvas) return;
      const width = canvas.clientWidth;
      if (width === 0) return;
      const scale = window.devicePixelRatio || 1;
      canvas.width = width * scale;
      canvas.height = chartHeight * scale;
      const context = canvas.getContext("2d");
      if (!context) return;
      const style = getComputedStyle(canvas);
      context.scale(scale, scale);
      context.strokeStyle = style.borderColor;
      for (const y of [4, chartHeight / 2, chartHeight - 4]) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.strokeStyle = style.color;
      context.fillStyle = style.color;
      context.lineWidth = 2;
      context.beginPath();
      let previous: MetricPoint | undefined;
      for (const point of points) {
        if (point.value === null) {
          previous = undefined;
          continue;
        }
        const x = first === last.time ? 4 : 4 + (point.time - first) / (last.time - first) * (width - 8);
        const y = chartHeight - 4 - (point.value - low) / (high - low) * (chartHeight - 8);
        if (previous && point.time - previous.time <= 900_000) context.lineTo(x, y);
        else context.moveTo(x, y);
        context.fillRect(x - 1, y - 1, 2, 2);
        previous = point;
      }
      context.stroke();
    }
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    const theme = new MutationObserver(paint);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => { observer.disconnect(); theme.disconnect(); };
  }, [first, high, last.time, low, points, values.length]);

  return <Card className="min-w-0">
    <CardHeader>
      <CardTitle className="text-sm">{title}</CardTitle>
      {last.value !== null && <CardDescription className="text-lg font-semibold tabular-nums text-foreground">
        {number.format(last.value)} {unit}
      </CardDescription>}
    </CardHeader>
    <CardContent>
      {values.length === 0 ? <p className="text-sm text-muted">Data belum tersedia.</p> : <>
        <p className="sr-only">Rentang terukur {number.format(Math.min(...values))} hingga {number.format(Math.max(...values))} {unit}.</p>
        {last.value === null && <p className="mb-2 text-xs text-muted">Sampel terakhir tanpa data.</p>}
        <canvas ref={draw} aria-hidden="true" className="block h-[92px] w-full border-border text-primary" />
        <div className="mt-2 flex justify-between gap-2 text-xs tabular-nums text-muted">
          <time dateTime={new Date(first).toISOString()}>{clock.format(first)}</time>
          {last.time !== first && <time dateTime={new Date(last.time).toISOString()}>{clock.format(last.time)}</time>}
        </div>
      </>}
    </CardContent>
  </Card>;
}
