"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import DataDialog from "@/uix/datadialog";
import SearchSelect from "@/uix/search-select";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import {
  fetchApprovalSigns, createApprovalSign, updateApprovalSign, deleteApprovalSign,
  fetchUserOptions, type ApprovalSign, type SignatureType, type ApprovalStep,
} from "../api";

interface SignersTabProps {
  signatureType: SignatureType;
  step: ApprovalStep;
}

export default function SignersTab({ signatureType, step }: SignersTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "update">("create");
  const [editing, setEditing] = useState<ApprovalSign | null>(null);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const opts = await fetchUserOptions();
        if (!cancelled) setUserOptions(opts);
      } catch {
        if (!cancelled) setUserOptions([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: Column<ApprovalSign>[] = [
    { header: "Username", accessor: "username", formatter: (v) => v || "-" },
    { header: "Full Name", accessor: "fullname", formatter: (v) => v || "-" },
  ];

  const actions: ActionConfig<ApprovalSign> = {
    onCreate: () => {
      setMode("create");
      setEditing(null);
      setUserId("");
      setError("");
      setOpen(true);
    },
    onUpdate: (row) => {
      setMode("update");
      setEditing(row);
      setUserId(row.user_id);
      setError("");
      setOpen(true);
    },
    onDelete: async (row) => {
      try {
        await deleteApprovalSign(signatureType.id, step.id, row.id);
        toast.success("Signer removed");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove signer");
      }
    },
    hideDetail: true,
  };

  async function handleSubmit() {
    if (!userId) {
      setError("User is required");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        await createApprovalSign(signatureType.id, step.id, { user_id: userId });
        toast.success("Signer added");
      } else if (editing) {
        await updateApprovalSign(signatureType.id, step.id, editing.id, { user_id: userId });
        toast.success("Signer updated");
      }
      setOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save signer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DataTable
        fetchData={() => fetchApprovalSigns(signatureType.id, step.id)}
        columns={columns}
        actions={actions}
        hideSearch
        hidePaging
        hideColumnToggle
        hideSelect={true}
        refreshTrigger={refreshTrigger}
      />
      <DataDialog
        isOpen={open}
        mode={mode}
        title={mode === "create" ? "Add Signer" : "Update Signer"}
        description={`${signatureType.code} - step ${step.step}`}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        loading={saving}
      >
        <div className="flex flex-col gap-4 p-4">
          <Field data-invalid={!!error}>
            <FieldContent>
              <FieldLabel>User</FieldLabel>
              <SearchSelect
                items={userOptions}
                value={userId || null}
                onValueChange={(v) => {
                  setUserId(v ?? "");
                  setError("");
                }}
                placeholder="Select user"
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