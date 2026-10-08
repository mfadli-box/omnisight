"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import DataDialog from "@/uix/datadialog";
import SearchSelect from "@/uix/search-select";
import { NativeSelect, NativeSelectOption } from "@/uix/native-select";
import { Badge } from "@/uix/badge";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { PRIVILEGE_LEVELS } from "../schemas";
import {
  fetchUserPrivileges, createUserPrivilege, updateUserPrivilege, removeUserPrivilege,
  fetchModuleOptions, type UserPrivilegeRow, type APP03User, type UserCompanyRow,
} from "../api";

interface PrivilegesTabProps {
  user: APP03User;
  userCompany: UserCompanyRow;
}

const levelVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  HIDE: "secondary",
  VIEW: "outline",
  BOOK: "default",
  POST: "destructive",
};

export default function PrivilegesTab({ user, userCompany }: PrivilegesTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [moduleOptions, setModuleOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [editingPrivilege, setEditingPrivilege] = useState<UserPrivilegeRow | null>(null);
  const [moduleId, setModuleId] = useState("");
  const [level, setLevel] = useState<string>("HIDE");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const opts = await fetchModuleOptions();
        if (!cancelled) setModuleOptions(opts);
      } catch {
        if (!cancelled) setModuleOptions([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: Column<UserPrivilegeRow>[] = [
    { header: "Module Code", accessor: "module_code", formatter: (v) => v || "-" },
    { header: "Module Name", accessor: "module_name", formatter: (v) => v || "-" },
    {
      header: "Level",
      accessor: "level",
      align: "center",
      formatter: (v) => (
        <Badge variant={levelVariant[v] ?? "secondary"}>{v}</Badge>
      ),
    },
    { header: "Created At", accessor: "created_at" },
  ];

  const actions: ActionConfig<UserPrivilegeRow> = {
    onCreate: () => {
      setModuleId("");
      setLevel("HIDE");
      setError("");
      setCreateOpen(true);
    },
    onUpdate: (row) => {
      setEditingPrivilege(row);
      setLevel(row.level);
      setError("");
      setUpdateOpen(true);
    },
    onDelete: async (row) => {
      try {
        await removeUserPrivilege(user.id, userCompany.id, row.id);
        toast.success("Privilege removed");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove privilege");
      }
    },
    hideDetail: true,
  };

  async function handleCreate() {
    if (!moduleId) {
      setError("Module is required");
      return;
    }
    setSaving(true);
    try {
      await createUserPrivilege(user.id, userCompany.id, { module_id: moduleId, level });
      toast.success("Privilege granted");
      setCreateOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant privilege");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingPrivilege) return;
    setSaving(true);
    try {
      await updateUserPrivilege(user.id, userCompany.id, editingPrivilege.id, { level });
      toast.success("Privilege updated");
      setUpdateOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update privilege");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DataTable
        fetchData={() => fetchUserPrivileges(user.id, userCompany.id)}
        columns={columns}
        actions={actions}
        hideSearch
        hidePaging
        hideColumnToggle
        hideSelect={true}
        refreshTrigger={refreshTrigger}
      />
      <DataDialog
        isOpen={createOpen}
        mode="create"
        title="Grant Privilege"
        description={`Grant module for ${user.username} @ ${userCompany.company_name ?? userCompany.company_code ?? ""}`}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
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
          <Field>
            <FieldContent>
              <FieldLabel>Level</FieldLabel>
              <NativeSelect
                className="w-full"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                {PRIVILEGE_LEVELS.map((lvl) => (
                  <NativeSelectOption key={lvl} value={lvl}>{lvl}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FieldContent>
          </Field>
        </div>
      </DataDialog>
      <DataDialog
        isOpen={updateOpen}
        mode="update"
        title="Update Privilege"
        description={`Change level for ${editingPrivilege?.module_name ?? editingPrivilege?.module_code ?? ""}`}
        onClose={() => setUpdateOpen(false)}
        onSubmit={handleUpdate}
        loading={saving}
      >
        <div className="flex flex-col gap-4 p-4">
          <Field>
            <FieldContent>
              <FieldLabel>Level</FieldLabel>
              <NativeSelect
                className="w-full"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                {PRIVILEGE_LEVELS.map((lvl) => (
                  <NativeSelectOption key={lvl} value={lvl}>{lvl}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FieldContent>
          </Field>
        </div>
      </DataDialog>
    </>
  );
}