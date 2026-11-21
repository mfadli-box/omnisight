"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ResourcePanel, type Field } from "./resource-panel";

const nodeColumns: Field[] = [
  { key: "node_code", label: "Node" }, { key: "hostname", label: "Hostname" },
  { key: "os_type", label: "Sistem operasi" }, { key: "status", label: "Status" },
  { key: "last_seen_at", label: "Heartbeat terakhir (UTC)" }, { key: "agent_version", label: "Versi agent" },
];

const heartbeatColumns: Field[] = [
  { key: "heartbeat_at", label: "Heartbeat terbaru (UTC)" },
  { key: "cpu_percent", label: "CPU (%)" }, { key: "ram_percent", label: "RAM (%)" },
  { key: "disk_percent", label: "Disk (%)" },
];
const statuses = [
  { value: "", label: "Semua status" }, { value: "ONLINE", label: "Online" },
  { value: "STALE", label: "Stale" }, { value: "PENDING", label: "Pending" }, { value: "DISABLED", label: "Disabled" },
];

export function AgentStatus({ telemetry = false }: { telemetry?: boolean }) {
  const [status, setStatus] = useState("");
  return <div className="space-y-4">
    <Card>
      <CardContent className="grid gap-2 p-4">
        <div className="w-full max-w-xs">
          <p className="mb-1.5 text-sm font-medium">Status pada halaman aktif</p>
          <Select label="Filter status node" options={statuses} value={status} onChange={setStatus} />
        </div>
        {telemetry && <p className="text-sm text-muted">Metrik heartbeat tersedia selama 15 menit setelah diterima.</p>}
      </CardContent>
    </Card>
    <ResourcePanel readOnly title={telemetry ? "Heartbeat agent" : "Kesehatan node"}
      path={telemetry ? "agents/status" : "nodes"}
      columns={telemetry ? [...nodeColumns, ...heartbeatColumns] : nodeColumns}
      filter={status ? (row) => row.status === status : undefined}
      emptyMessage={status ? "Tidak ada node dengan status ini pada halaman aktif." : undefined}
      summarize={telemetry ? undefined : (rows) => <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statuses.slice(1).map(({ value, label }) => <Card key={value}>
          <CardHeader><CardTitle className="text-sm font-medium text-muted">{label}</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">{rows.filter((row) => row.status === value).length}</p></CardContent>
        </Card>)}
      </div>} />
  </div>;
}
