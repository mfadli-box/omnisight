"use client";

import { useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import { Badge } from "@/uix/badge";
import { fetchUsers, deleteUser, type APP03User } from "../api";
import UserForm from "./user-form";

interface UserTableProps {
  onSelectUser: (user: APP03User | null) => void;
  selectedUserId?: string;
}

export default function UserTable({ onSelectUser, selectedUserId }: UserTableProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "update">("create");
  const [editingUser, setEditingUser] = useState<APP03User | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  const columns: Column<APP03User>[] = [
    { header: "Username", accessor: "username", sortable: true },
    { header: "Full Name", accessor: "fullname" },
    { header: "Email", accessor: "email" },
    { header: "Company", accessor: "company_name", formatter: (v) => v || "-" },
    { header: "Role", accessor: "role" },
    {
      header: "Status",
      accessor: "is_active",
      align: "center",
      formatter: (v) => (
        <Badge variant={v ? "default" : "destructive"}>{v ? "Active" : "Inactive"}</Badge>
      ),
    },
  ];

  const actions: ActionConfig<APP03User> = {
    onCreate: () => {
      setFormMode("create");
      setEditingUser(null);
      setFormKey((k) => k + 1);
      setFormOpen(true);
    },
    onUpdate: (row) => {
      setFormMode("update");
      setEditingUser(row);
      setFormKey((k) => k + 1);
      setFormOpen(true);
    },
    onDelete: async (row) => {
      try {
        await deleteUser(row.id);
        toast.success(`User ${row.username} deleted`);
        if (selectedUserId === row.id) {
          onSelectUser(null);
        }
        setRefreshTrigger((prev) => !prev);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete user");
      }
    },
    onSelect: (row) => onSelectUser(row),
    hideDetail: true,
  };

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        fetchData={fetchUsers}
        columns={columns}
        actions={actions}
        refreshTrigger={refreshTrigger}
      />
      <UserForm
        key={`${formMode}-${editingUser?.id ?? "new"}-${formKey}`}
        isOpen={formOpen}
        mode={formMode}
        user={editingUser}
        onClose={() => setFormOpen(false)}
        onSaved={() => setRefreshTrigger((prev) => !prev)}
      />
    </div>
  );
}