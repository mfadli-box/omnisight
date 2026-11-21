"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { message } from "@/services/api";
import { nodeHistory } from "@/services/telemetry";
import type { DataRow } from "@/validations/resource.schema";
import type { NodeMetric } from "@/validations/telemetry.schema";
import { DataTable } from "./data-table";
import { Feedback } from "./form-feedback";
import { MetricChart } from "./metric-chart";

const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const smartColumns: ColumnDef<DataRow>[] = [
  { accessorKey: "id", header: "Perangkat" },
  { accessorKey: "model", header: "Model", cell: ({ getValue }) => getValue<string>() || "—" },
  { accessorKey: "passed", header: "Kesehatan", cell: ({ getValue }) => {
    const status = getValue<boolean | null>();
    return <Badge className={status === false ? "border-danger/40 text-danger" : undefined}>
      {status === true ? "Lulus" : status === false ? "Gagal" : "Tidak diketahui"}
    </Badge>;
  } },
];
const containerColumns: ColumnDef<DataRow>[] = [
  { accessorKey: "name", header: "Kontainer" },
  { accessorKey: "cpu_pct", header: "CPU", cell: ({ getValue }) => `${number.format(getValue<number>())}%` },
  { accessorKey: "memory", header: "Memori" },
  { accessorKey: "network", header: "Jaringan (RX / TX)" },
  { accessorKey: "block_io", header: "Disk I/O (baca / tulis)" },
];

function rate<T>(current: T[], previous: T[] | undefined, seconds: number, key: (counter: T) => string,
  values: (counter: T) => [number, number]) {
  if (!previous || seconds <= 0 || seconds > 900) return null;
  const baseline = new Map(previous.map((counter) => [key(counter), values(counter)]));
  let total: number | null = null;
  for (const counter of current) {
    const prior = baseline.get(key(counter));
    const [a, b] = values(counter);
    if (!prior || a < prior[0] || b < prior[1]) continue;
    total = (total ?? 0) + (a - prior[0]) + (b - prior[1]);
  }
  return total === null ? null : total / seconds / 1024;
}

function ResourceCharts({ samples }: { samples: NodeMetric[] }) {
  const ordered = [...samples].reverse();
  const points = (metric: (sample: NodeMetric, previous: NodeMetric | undefined, elapsed: number) => number | null) =>
    ordered.map((sample, i) => {
      const time = Date.parse(sample.recorded_at);
      const previous = ordered[i - 1];
      const elapsed = previous ? (time - Date.parse(previous.recorded_at)) / 1000 : 0;
      return { time, value: metric(sample, previous, elapsed) };
    });
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <MetricChart title="CPU" unit="%" max={100} points={points((s) => s.cpu_pct)} />
    <MetricChart title="RAM terpakai" unit="MiB" max={Math.max(...samples.map((s) => s.ram_total_mb))}
      points={points((s) => s.ram_used_mb)} />
    <MetricChart title="Disk terisi paling tinggi" unit="%" max={100}
      points={points((s) => Math.max(...s.disk_json.map((disk) => 100 * disk.used_bytes / disk.total_bytes)))} />
    <MetricChart title="Disk I/O total" unit="KiB/dtk" points={points((s, p, elapsed) =>
      rate(s.disk_io_json, p?.disk_io_json, elapsed, (d) => d.device, (d) => [d.read_bytes, d.write_bytes]))} />
    <MetricChart title="Lalu lintas jaringan total" unit="KiB/dtk" points={points((s, p, elapsed) =>
      rate(s.net_json, p?.net_json, elapsed, (n) => n.interface, (n) => [n.rx_bytes, n.tx_bytes]))} />
    <MetricChart title="Load average 1 menit" unit="" points={points((s) => s.load_avg?.[0] ?? null)} />
    <MetricChart title="Suhu" unit="°C" points={points((s) => s.temp_c)} />
  </div>;
}

export function NodeTelemetry({ id, name, close }: { id: string; name: string; close: () => void }) {
  const heading = useRef<HTMLElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; samples?: NodeMetric[]; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    nodeHistory(id, controller.signal)
      .then((samples) => { if (!controller.signal.aborted) setResult({ revision, samples }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setResult({ revision, error: message(error) }); });
    return () => controller.abort();
  }, [id, revision]);

  const current = result?.revision === revision ? result : undefined;
  const latest = current?.samples?.[0];
  return <section ref={heading} tabIndex={-1} aria-label={`Telemetri ${name}`} className="space-y-4 rounded-xl outline-primary">
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{name}</CardTitle>
          {latest && <CardDescription>
            Sampel terakhir <time dateTime={latest.recorded_at}>{date.format(Date.parse(latest.recorded_at))}</time>
          </CardDescription>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)} disabled={!current}>Muat ulang</Button>
          <Button variant="ghost" size="sm" onClick={close}>Tutup</Button>
        </div>
      </CardHeader>
      {(!current || current.error || !latest) && <CardContent>
        {!current ? <p role="status" className="text-sm text-muted">Memuat riwayat telemetri…</p>
          : current.error ? <Feedback error={current.error} />
          : <p className="text-sm text-muted">Belum ada sampel telemetri untuk node ini.</p>}
      </CardContent>}
    </Card>
    {latest && current?.samples && <>
      <ResourceCharts samples={current.samples} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>S.M.A.R.T. disk</CardTitle></CardHeader>
          <CardContent>{latest.smart_json.length > 0
            ? <DataTable title="Kesehatan disk S.M.A.R.T." columns={smartColumns}
                rows={latest.smart_json.map((disk) => ({ ...disk, id: disk.device }))} />
            : <p className="text-sm text-muted">Data S.M.A.R.T. belum tersedia.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Kontainer</CardTitle></CardHeader>
          <CardContent>{latest.containers_json.length > 0
            ? <DataTable title="Statistik kontainer" columns={containerColumns} rows={latest.containers_json} />
            : <p className="text-sm text-muted">Statistik kontainer belum tersedia.</p>}
          </CardContent>
        </Card>
      </div>
    </>}
  </section>;
}
