"use client";

import DataTable, { type Column } from "@/uix/datatable";
import { Badge } from "@/uix/badge";
import { formatDateTime } from "@/lib/utility";
import { fetchActions, type UserAction } from "../api";

const methodVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  GET: "secondary",
  POST: "default",
  PUT: "outline",
  PATCH: "outline",
  DELETE: "destructive",
};

export default function ActionsTable() {
  const columns: Column<UserAction>[] = [
    { header: "Username", accessor: "username", sortable: true, formatter: (v) => v || "-" },
    { header: "Full Name", accessor: "fullname", formatter: (v) => v || "-" },
    { header: "Module", accessor: "module_code", sortable: true, formatter: (v) => v || "-" },
    {
      header: "Action",
      accessor: "action",
      sortable: true,
      align: "center",
      formatter: (v) => <Badge variant={methodVariant[v] ?? "secondary"}>{v}</Badge>,
    },
    {
      header: "Path",
      accessor: "path",
      formatter: (v) => <span className="font-mono text-xs">{v}</span>,
    },
    { header: "IP", accessor: "ip_address", sortable: true, formatter: (v) => v || "-" },
    {
      header: "User Agent",
      accessor: "user_agent",
      formatter: (v) => (v ? <span className="text-xs">{v}</span> : "-"),
    },
    { header: "Time", accessor: "created_at", sortable: true, formatter: (v) => formatDateTime(v) },
  ];

  return <DataTable fetchData={fetchActions} columns={columns} hideSelect />;
}
