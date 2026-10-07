"use client";

import { useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import { Badge } from "@/uix/badge";
import { fetchCompanies, deleteCompany, type APP02Company } from "../api";
import CompanyForm from "./company-form";

interface CompanyTableProps {
  onSelectCompany: (company: APP02Company | null) => void;
  selectedCompanyId?: string;
}

export default function CompanyTable({ onSelectCompany, selectedCompanyId }: CompanyTableProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "update">("create");
  const [editingCompany, setEditingCompany] = useState<APP02Company | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  const columns: Column<APP02Company>[] = [
    { header: "Code", accessor: "code", sortable: true },
    { header: "Name", accessor: "name" },
    { header: "Valuta", accessor: "valuta" },
    { header: "VAT ID", accessor: "vat_id", formatter: (v) => v || "-" },
    {
      header: "Status",
      accessor: "is_active",
      align: "center",
      formatter: (v) => (
        <Badge variant={v ? "default" : "destructive"}>{v ? "Active" : "Inactive"}</Badge>
      ),
    },
  ];

  const actions: ActionConfig<APP02Company> = {
    onCreate: () => {
      setFormMode("create");
      setEditingCompany(null);
      setFormOpen(true);
    },
    onUpdate: (row) => {
      setFormMode("update");
      setEditingCompany(row);
      setFormOpen(true);
    },
    onDelete: async (row) => {
      try {
        await deleteCompany(row.id);
        toast.success(`Company ${row.code} deleted`);
        if (selectedCompanyId === row.id) {
          onSelectCompany(null);
        }
        setRefreshTrigger((prev) => !prev);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete company");
      }
    },
    onSelect: (row) => onSelectCompany(row),
    hideDetail: true,
  };

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        fetchData={fetchCompanies}
        columns={columns}
        actions={actions}
        refreshTrigger={refreshTrigger}
      />
      <CompanyForm
        isOpen={formOpen}
        mode={formMode}
        company={editingCompany}
        onClose={() => setFormOpen(false)}
        onSaved={() => setRefreshTrigger((prev) => !prev)}
      />
    </div>
  );
}
