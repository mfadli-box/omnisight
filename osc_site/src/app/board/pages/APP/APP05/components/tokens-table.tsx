"use client";

import { useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import { Badge } from "@/uix/badge";
import { formatDateTime } from "@/lib/utility";
import { fetchTokens, deleteToken, type UserToken } from "../api";
import TokenForm from "./token-form";

export default function TokensTable() {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "update">("create");
  const [editing, setEditing] = useState<UserToken | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  const columns: Column<UserToken>[] = [
    { header: "Username", accessor: "username", sortable: true, formatter: (v) => v || "-" },
    { header: "Full Name", accessor: "fullname", formatter: (v) => v || "-" },
    { header: "Type", accessor: "token_type", sortable: true },
    {
      header: "Token",
      accessor: "token",
      formatter: (v) => <span className="font-mono text-xs">{String(v).slice(0, 16)}…</span>,
    },
    { header: "IP", accessor: "ip_address", formatter: (v) => v || "-" },
    {
      header: "Blocked",
      accessor: "is_blocked",
      align: "center",
      formatter: (v) => (
        <Badge variant={v ? "destructive" : "secondary"}>{v ? "BLOCKED" : "OK"}</Badge>
      ),
    },
    {
      header: "Revoked",
      accessor: "revoked_at",
      align: "center",
      formatter: (v) => (v ? <Badge variant="outline">REVOKED</Badge> : "-"),
    },
    { header: "Issued", accessor: "issued_at", sortable: true, formatter: (v) => formatDateTime(v) },
    { header: "Expires", accessor: "access_expires_at", sortable: true, formatter: (v) => formatDateTime(v) },
  ];

  const actions: ActionConfig<UserToken> = {
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
        await deleteToken(row.id);
        toast.success("Token deleted");
        setRefreshTrigger((prev) => !prev);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete token");
      }
    },
    hideDetail: true,
  };

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        fetchData={fetchTokens}
        columns={columns}
        actions={actions}
        hideSelect
        refreshTrigger={refreshTrigger}
      />
      <TokenForm
        key={`${formMode}-${editing?.id ?? "new"}-${formKey}`}
        isOpen={formOpen}
        mode={formMode}
        token={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => setRefreshTrigger((prev) => !prev)}
      />
    </div>
  );
}