"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import DataDialog from "@/uix/datadialog";
import { Input } from "@/uix/input";
import { Textarea } from "@/uix/textarea";
import { Switch } from "@/uix/switch";
import { Badge } from "@/uix/badge";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { companyAreaSchema, type CompanyAreaValues } from "../schemas";
import {
  fetchCompanyAreas, createCompanyArea, updateCompanyArea, deleteCompanyArea,
  type CompanyAreaRow, type APP02Company,
} from "../api";

interface AreasTabProps {
  company: APP02Company;
}

function defaultValues(area: CompanyAreaRow | null): CompanyAreaValues {
  return {
    code: area?.code ?? "",
    name: area?.name ?? "",
    description: area?.description ?? "",
    is_active: area?.is_active ?? true,
  };
}

function toErrors(err: z.ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !map[key]) {
      map[key] = issue.message;
    }
  }
  return map;
}

export default function AreasTab({ company }: AreasTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "update">("create");
  const [editingArea, setEditingArea] = useState<CompanyAreaRow | null>(null);
  const [values, setValues] = useState<CompanyAreaValues>(() => defaultValues(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const columns: Column<CompanyAreaRow>[] = [
    { header: "Code", accessor: "code", sortable: true },
    { header: "Name", accessor: "name" },
    { header: "Description", accessor: "description", formatter: (v) => v || "-" },
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

  const actions: ActionConfig<CompanyAreaRow> = {
    onCreate: () => {
      setFormMode("create");
      setEditingArea(null);
      setValues(defaultValues(null));
      setErrors({});
      setFormOpen(true);
    },
    onUpdate: (row) => {
      setFormMode("update");
      setEditingArea(row);
      setValues(defaultValues(row));
      setErrors({});
      setFormOpen(true);
    },
    onDelete: async (row) => {
      try {
        await deleteCompanyArea(company.id, row.id);
        toast.success("Area deleted");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete area");
      }
    },
    hideDetail: true,
  };

  async function handleSubmit() {
    const parsed = companyAreaSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (formMode === "create") {
        await createCompanyArea(company.id, parsed.data);
        toast.success("Area created");
      } else if (editingArea) {
        const body: Record<string, unknown> = { ...parsed.data };
        if (typeof body.description === "string" && body.description === "") {
          delete body.description;
        }
        await updateCompanyArea(company.id, editingArea.id, body);
        toast.success("Area updated");
      }
      setFormOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save area");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <DataTable
        fetchData={() => fetchCompanyAreas(company.id)}
        columns={columns}
        actions={actions}
        hideSearch
        hidePaging
        hideColumnToggle
        hideSelect={true}
        refreshTrigger={refreshTrigger}
      />
      <DataDialog
        isOpen={formOpen}
        mode={formMode}
        title={formMode === "create" ? "Create Area" : "Update Area"}
        description={formMode === "create" ? `Add area for ${company.code}` : `Edit area ${editingArea?.code ?? ""}`}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        loading={loading}
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.code}>
              <FieldContent>
                <FieldLabel>Code</FieldLabel>
                <Input
                  placeholder="Area code"
                  value={values.code}
                  onChange={(e) => setValues((prev) => ({ ...prev, code: e.target.value }))}
                  aria-invalid={!!errors.code}
                />
                <FieldError errors={errors.code ? [{ message: errors.code }] : undefined} />
              </FieldContent>
            </Field>
            <Field data-invalid={!!errors.name}>
              <FieldContent>
                <FieldLabel>Name</FieldLabel>
                <Input
                  placeholder="Area name"
                  value={values.name}
                  onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
                  aria-invalid={!!errors.name}
                />
                <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
              </FieldContent>
            </Field>
          </div>
          <Field>
            <FieldContent>
              <FieldLabel>Description</FieldLabel>
              <Textarea
                placeholder="Area description"
                value={values.description ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, description: e.target.value }))}
              />
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel>Is Active</FieldLabel>
            <FieldContent>
              <Switch
                checked={values.is_active}
                onCheckedChange={(checked) => setValues((prev) => ({ ...prev, is_active: checked }))}
              />
            </FieldContent>
          </Field>
        </div>
      </DataDialog>
    </>
  );
}
