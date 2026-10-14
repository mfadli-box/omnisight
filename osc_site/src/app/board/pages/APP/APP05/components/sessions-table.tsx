"use client";

import { useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import { Badge } from "@/uix/badge";
import { formatDateTime } from "@/lib/utility";
import { fetchSessions, deleteSession, type UserSession } from "../api";
import SessionForm from "./session-form";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  EXPIRED: "secondary",
  ENDED: "outline",
  REVOKED: "destructive",
};

export default function SessionsTable() {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "update">("create");
  const [editing, setEditing] = useState<UserSession | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  const columns: Column<UserSession>[] = [
    { header: "Username", accessor: "username", sortable: true, formatter: (v) => v || "-" },
    { header: "Full Name", accessor: "fullname", formatter: (v) => v || "-" },
    {
      header: "Session Token",
      accessor: "session_token",
      formatter: (v) => <span className="font-mono text-xs">{String(v).slice(0, 16)}…</span>,
    },
    { header: "IP", accessor: "ip_address", formatter: (v) => v || "-" },
    {
      header: "Status",
      accessor: "status",
      align: "center",
      formatter: (v) => <Badge variant={statusVariant[v] ?? "secondary"}>{v}</Badge>,
    },
    { header: "Started", accessor: "started_at", sortable: true, formatter: (v) => formatDateTime(v) },
    { header: "Last Active", accessor: "last_active", sortable: true, formatter: (v) => formatDateTime(v) },
  ];

  const actions: ActionConfig<UserSession> = {
    onCreate: () => {
      setFormMode("create");
      setEditing(null);
      setFormKey((k) => k + 1);
      setFormOpen(true);
    },
    onUpdate: (row) => {
      setFormMode("update");
      setEditing(row);
      setFormKey((k) => k + 1);
      setFormOpen(true);
    },
    onDelete: async (row) => {
      try {
        await deleteSession(row.id);
        toast.success("Session deleted");
        setRefreshTrigger((prev) => !prev);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete session");
      }
    },
    hideDetail: true,
  };

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        fetchData={fetchSessions}
        columns={columns}
        actions={actions}
        hideSelect
        refreshTrigger={refreshTrigger}
      />
      <SessionForm
        key={`${formMode}-${editing?.id ?? "new"}-${formKey}`}
        isOpen={formOpen}
        mode={formMode}
        session={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => setRefreshTrigger((prev) => !prev)}
      />
    </div>
  );
}