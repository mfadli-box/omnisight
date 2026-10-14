"use client";

import { useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import { fetchSignatureTypes, deleteSignatureType, type SignatureType } from "../api";
import SignatureTypeForm from "./types-form";

interface TypesTableProps {
  onSelectType: (st: SignatureType | null) => void;
  selectedTypeId?: string;
}

export default function TypesTable({ onSelectType, selectedTypeId }: TypesTableProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "update">("create");
  const [editing, setEditing] = useState<SignatureType | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  const columns: Column<SignatureType>[] = [
    { header: "Code", accessor: "code", sortable: true },
    { header: "Name", accessor: "name", sortable: true },
    { header: "Created At", accessor: "created_at" },
    { header: "Updated At", accessor: "updated_at" },
  ];

  const actions: ActionConfig<SignatureType> = {
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
        await deleteSignatureType(row.id);
        toast.success(`Signature type ${row.code} deleted`);
        if (selectedTypeId === row.id) {
          onSelectType(null);
        }
        setRefreshTrigger((prev) => !prev);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete signature type");
      }
    },
    onSelect: (row) => onSelectType(row),
    hideDetail: true,
  };

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        fetchData={fetchSignatureTypes}
        columns={columns}
        actions={actions}
        refreshTrigger={refreshTrigger}
      />
      <SignatureTypeForm
        key={`${formMode}-${editing?.id ?? "new"}-${formKey}`}
        isOpen={formOpen}
        mode={formMode}
        signatureType={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => setRefreshTrigger((prev) => !prev)}
      />
    </div>
  );
}