"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import DataDialog from "@/uix/datadialog";
import SearchSelect from "@/uix/search-select";
import { Badge } from "@/uix/badge";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import {
  fetchUserCompanies, assignUserCompany, updateUserCompany, removeUserCompany,
  fetchCompanyOptions, type UserCompanyRow, type APP03User,
} from "../api";

interface CompaniesTabProps {
  user: APP03User;
  onSelectCompany: (company: UserCompanyRow | null) => void;
}

export default function CompaniesTab({ user, onSelectCompany }: CompaniesTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const opts = await fetchCompanyOptions();
        if (!cancelled) setCompanyOptions(opts);
      } catch {
        if (!cancelled) setCompanyOptions([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: Column<UserCompanyRow>[] = [
    { header: "Company Code", accessor: "company_code", formatter: (v) => v || "-" },
    { header: "Company Name", accessor: "company_name", formatter: (v) => v || "-" },
    {
      header: "Status",
      accessor: "is_active",
      align: "center",
      formatter: (v) => (
        <Badge variant={v ? "default" : "destructive"}>{v ? "Active" : "Inactive"}</Badge>
      ),
    },
    { header: "Created At", accessor: "created_at" },
  ];

  const actions: ActionConfig<UserCompanyRow> = {
    onCreate: () => {
      setCompanyId("");
      setError("");
      setAssignOpen(true);
    },
    onSelect: (row) => onSelectCompany(row),
    onUpdate: async (row) => {
      try {
        await updateUserCompany(user.id, row.id, { is_active: !row.is_active });
        toast.success("Company assignment updated");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update company assignment");
      }
    },
    onDelete: async (row) => {
      try {
        await removeUserCompany(user.id, row.id);
        toast.success("Company assignment removed");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove company assignment");
      }
    },
    hideDetail: true,
  };

  async function handleAssign() {
    if (!companyId) {
      setError("Company is required");
      return;
    }
    setSaving(true);
    try {
      await assignUserCompany(user.id, { company_id: companyId, is_active: true });
      toast.success("Company assigned");
      setAssignOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign company");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DataTable
        fetchData={() => fetchUserCompanies(user.id)}
        columns={columns}
        actions={actions}
        hideSearch
        hidePaging
        hideColumnToggle
        refreshTrigger={refreshTrigger}
      />
      <DataDialog
        isOpen={assignOpen}
        mode="create"
        title="Assign Company"
        description={`Add company for user ${user.username}`}
        onClose={() => setAssignOpen(false)}
        onSubmit={handleAssign}
        loading={saving}
      >
        <div className="flex flex-col gap-4 p-4">
          <Field data-invalid={!!error}>
            <FieldContent>
              <FieldLabel>Company</FieldLabel>
              <SearchSelect
                items={companyOptions}
                value={companyId || null}
                onValueChange={(v) => {
                  setCompanyId(v ?? "");
                  setError("");
                }}
                placeholder="Select company"
                error={!!error}
              />
              <FieldError errors={error ? [{ message: error }] : undefined} />
            </FieldContent>
          </Field>
        </div>
      </DataDialog>
    </>
  );
}