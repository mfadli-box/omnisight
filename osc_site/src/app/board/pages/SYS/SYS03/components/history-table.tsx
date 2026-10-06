"use client";

import DataTable, { type Column } from "@/uix/datatable";
import { Badge } from "@/uix/badge";
import { fetchHistory, type SYS03HistoryRow } from "../api";

function formatUA(ua?: string | null): string {
  if (!ua) return "-";
  if (ua.length > 60) return `${ua.slice(0, 60)}...`;
  return ua;
}

export default function HistoryTable() {
  const columns: Column<SYS03HistoryRow>[] = [
    { header: "Type", accessor: "token_type", sortable: true },
    { header: "IP Address", accessor: "ip_address", formatter: (v) => v || "-" },
    { header: "User Agent", accessor: "user_agent", formatter: (v) => formatUA(v) },
    { header: "Issued At", accessor: "issued_at", sortable: true },
    { header: "Expires", accessor: "access_expires_at", sortable: true },
    {
      header: "Status",
      accessor: "is_blocked",
      align: "center",
      formatter: (v, row) => {
        if (row.revoked_at) return <Badge variant="destructive">Revoked</Badge>;
        return <Badge variant={v ? "destructive" : "default"}>{v ? "Blocked" : "Active"}</Badge>;
      },
    },
    { header: "Created At", accessor: "created_at", sortable: true },
  ];

  return (
    <DataTable fetchData={fetchHistory} columns={columns} hideSelect />
  );
}
