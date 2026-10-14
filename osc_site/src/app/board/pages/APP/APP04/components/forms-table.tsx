"use client";

import { useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import { Badge } from "@/uix/badge";
import { fetchSignatureForms, deleteSignatureForm, type SignatureForm } from "../api";
import SignatureFormForm from "./forms-form";

interface FormsTableProps {
  onSelectForm: (form: SignatureForm | null) => void;
  selectedFormId?: string;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  CANCELLED: "outline",
};

export default function FormsTable({ onSelectForm, selectedFormId }: FormsTableProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "update">("create");
  const [editing, setEditing] = useState<SignatureForm | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  const columns: Column<SignatureForm>[] = [
    { header: "Request ID", accessor: "request_id", sortable: true },
    { header: "Type Code", accessor: "signature_type_code", formatter: (v) => v || "-" },
    { header: "Type Name", accessor: "signature_type_name", formatter: (v) => v || "-" },
    { header: "Step", accessor: "step", sortable: true, align: "center" },
    {
      header: "Status",
      accessor: "status",
      align: "center",
      sortable: true,
      formatter: (v) => (
        <Badge variant={statusVariant[v] ?? "secondary"}>{v}</Badge>
      ),
    },
    { header: "Created At", accessor: "created_at" },
  ];

  const actions: ActionConfig<SignatureForm> = {
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
        await deleteSignatureForm(row.id);
        toast.success(`Signature form ${row.request_id} deleted`);
        if (selectedFormId === row.id) {
          onSelectForm(null);
        }
        setRefreshTrigger((prev) => !prev);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete signature form");
      }
    },
    onSelect: (row) => onSelectForm(row),
    hideDetail: true,
  };

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        fetchData={fetchSignatureForms}
        columns={columns}
        actions={actions}
        refreshTrigger={refreshTrigger}
      />
      <SignatureFormForm
        key={`${formMode}-${editing?.id ?? "new"}-${formKey}`}
        isOpen={formOpen}
        mode={formMode}
        signatureForm={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => setRefreshTrigger((prev) => !prev)}
      />
    </div>
  );
}