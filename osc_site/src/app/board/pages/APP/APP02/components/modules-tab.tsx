"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import DataDialog from "@/uix/datadialog";
import SearchSelect from "@/uix/search-select";
import { Badge } from "@/uix/badge";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import {
  fetchCompanyModules, assignCompanyModule, updateCompanyModule, removeCompanyModule,
  fetchModuleOptions, type CompanyModuleRow, type APP02Company,
} from "../api";

interface ModulesTabProps {
  company: APP02Company;
}

export default function ModulesTab({ company }: ModulesTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [moduleOptions, setModuleOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [moduleId, setModuleId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const opts = await fetchModuleOptions();
        if (!cancelled) {
          setModuleOptions(opts);
        }
      } catch {
        if (!cancelled) {
          setModuleOptions([]);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: Column<CompanyModuleRow>[] = [
    { header: "Module Code", accessor: "module_code", formatter: (v) => v || "-" },
    { header: "Module Name", accessor: "module_name", formatter: (v) => v || "-" },
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

  const actions: ActionConfig<CompanyModuleRow> = {
    onCreate: () => {
      setModuleId("");
      setError("");
      setAssignOpen(true);
    },
    onUpdate: async (row) => {
      try {
        await updateCompanyModule(company.id, row.id, { is_active: !row.is_active });
        toast.success("Module assignment updated");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update module assignment");
      }
    },
    onDelete: async (row) => {
      try {
        await removeCompanyModule(company.id, row.id);
        toast.success("Module assignment removed");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove module assignment");
      }
    },
    hideDetail: true,
  };

  async function handleAssign() {
    if (!moduleId) {
      setError("Module is required");
      return;
    }
    setSaving(true);
    try {
      await assignCompanyModule(company.id, { module_id: moduleId, is_active: true });
      toast.success("Module assigned");
      setAssignOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign module");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DataTable
        fetchData={() => fetchCompanyModules(company.id)}
        columns={columns}
        actions={actions}
        hideSearch
        hidePaging
        hideColumnToggle
        hideSelect={true}
        refreshTrigger={refreshTrigger}
      />
      <DataDialog
        isOpen={assignOpen}
        mode="create"
        title="Assign Module"
        description={`Add module for company ${company.code}`}
        onClose={() => setAssignOpen(false)}
        onSubmit={handleAssign}
        loading={saving}
      >
        <div className="flex flex-col gap-4 p-4">
          <Field data-invalid={!!error}>
            <FieldContent>
              <FieldLabel>Module</FieldLabel>
              <SearchSelect
                items={moduleOptions}
                value={moduleId || null}
                onValueChange={(v) => {
                  setModuleId(v ?? "");
                  setError("");
                }}
                placeholder="Select module"
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
