"use client";

import { useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import { Badge } from "@/uix/badge";
import { fetchModules, deleteModule, type APP01Module } from "../api";
import ModuleForm from "./module-form";

interface ModuleTableProps {
  onSelectModule: (module: APP01Module | null) => void;
  selectedModuleId?: string;
}

export default function ModuleTable({ onSelectModule, selectedModuleId }: ModuleTableProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "update">("create");
  const [editingModule, setEditingModule] = useState<APP01Module | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  const columns: Column<APP01Module>[] = [
    { header: "Code", accessor: "code", sortable: true },
    { header: "Name", accessor: "name" },
    { header: "Path", accessor: "path" },
    { header: "Parent ID", accessor: "parent_id", formatter: (v) => v || "-" },
    {
      header: "Page",
      accessor: "is_page",
      align: "center",
      formatter: (v) => (
        <Badge variant={v ? "default" : "secondary"}>{v ? "YES" : "NO"}</Badge>
      ),
    },
    {
      header: "Status",
      accessor: "is_active",
      align: "center",
      formatter: (v) => (
        <Badge variant={v ? "default" : "destructive"}>{v ? "Active" : "Inactive"}</Badge>
      ),
    },
  ];

  const actions: ActionConfig<APP01Module> = {
    onCreate: () => {
      setFormMode("create");
      setEditingModule(null);
      setFormOpen(true);
    },
    onUpdate: (row) => {
      setFormMode("update");
      setEditingModule(row);
      setFormOpen(true);
    },
    onDelete: async (row) => {
      try {
        await deleteModule(row.id);
        toast.success(`Module ${row.code} deleted`);
        if (selectedModuleId === row.id) {
          onSelectModule(null);
        }
        setRefreshTrigger((prev) => !prev);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete module");
      }
    },
    hideDetail: true,
    hideDelete: true,
  };

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        fetchData={fetchModules}
        columns={columns}
        actions={actions}
        refreshTrigger={refreshTrigger}
        hideSelect={true}
      />
      <ModuleForm
        isOpen={formOpen}
        mode={formMode}
        module={editingModule}
        onClose={() => setFormOpen(false)}
        onSaved={() => setRefreshTrigger((prev) => !prev)}
      />
    </div>
  );
}
