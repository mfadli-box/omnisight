"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import DataDialog from "@/uix/datadialog";
import SearchSelect from "@/uix/search-select";
import { Badge } from "@/uix/badge";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import {
  fetchUserAreas, assignUserArea, updateUserArea, removeUserArea,
  fetchCompanyOptions, fetchAreaOptions, type UserAreaRow, type APP03User,
} from "../api";

interface AreasTabProps {
  user: APP03User;
}

export default function AreasTab({ user }: AreasTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [areaOptions, setAreaOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [areaId, setAreaId] = useState("");
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!companyId) {
        setAreaOptions([]);
        setAreaId("");
        return;
      }
      try {
        const opts = await fetchAreaOptions(companyId);
        if (!cancelled) {
          setAreaOptions(opts);
          setAreaId("");
        }
      } catch {
        if (!cancelled) {
          setAreaOptions([]);
          setAreaId("");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const columns: Column<UserAreaRow>[] = [
    { header: "Area Code", accessor: "area_code", formatter: (v) => v || "-" },
    { header: "Area Name", accessor: "area_name", formatter: (v) => v || "-" },
    { header: "Company", accessor: "company_name", formatter: (v) => v || "-" },
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

  const actions: ActionConfig<UserAreaRow> = {
    onCreate: () => {
      setCompanyId("");
      setAreaId("");
      setError("");
      setAssignOpen(true);
    },
    onUpdate: async (row) => {
      try {
        await updateUserArea(user.id, row.id, { is_active: !row.is_active });
        toast.success("Area assignment updated");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update area assignment");
      }
    },
    onDelete: async (row) => {
      try {
        await removeUserArea(user.id, row.id);
        toast.success("Area assignment removed");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove area assignment");
      }
    },
    hideDetail: true,
  };

  async function handleAssign() {
    if (!companyId) {
      setError("Company is required");
      return;
    }
    if (!areaId) {
      setError("Area is required");
      return;
    }
    setSaving(true);
    try {
      await assignUserArea(user.id, { company_area_id: areaId, is_active: true });
      toast.success("Area assigned");
      setAssignOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign area");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DataTable
        fetchData={() => fetchUserAreas(user.id)}
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
        title="Assign Area"
        description={`Add area for user ${user.username}`}
        onClose={() => setAssignOpen(false)}
        onSubmit={handleAssign}
        loading={saving}
      >
        <div className="flex flex-col gap-4 p-4">
          <Field data-invalid={!!error && !companyId}>
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
                error={!!error && !companyId}
              />
            </FieldContent>
          </Field>
          <Field data-invalid={!!error && !!companyId && !areaId}>
            <FieldContent>
              <FieldLabel>Area</FieldLabel>
              <SearchSelect
                items={areaOptions}
                value={areaId || null}
                onValueChange={(v) => {
                  setAreaId(v ?? "");
                  setError("");
                }}
                placeholder={companyId ? "Select area" : "Select a company first"}
                disabled={!companyId}
                error={!!error && !!companyId && !areaId}
              />
              <FieldError errors={error && companyId && !areaId ? [{ message: error }] : undefined} />
            </FieldContent>
          </Field>
          {companyId && areaOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">No areas available for the selected company.</p>
          )}
        </div>
      </DataDialog>
    </>
  );
}