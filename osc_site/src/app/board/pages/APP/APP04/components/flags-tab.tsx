"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import DataDialog from "@/uix/datadialog";
import SearchSelect from "@/uix/search-select";
import { NativeSelect, NativeSelectOption } from "@/uix/native-select";
import { Textarea } from "@/uix/textarea";
import { Badge } from "@/uix/badge";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { SIGNATURE_STATUSES } from "../schemas";
import {
  fetchSignatureFlags, createSignatureFlag, updateSignatureFlag, deleteSignatureFlag,
  fetchUserOptions, type SignatureFlag, type SignatureForm,
} from "../api";

interface FlagsTabProps {
  signatureForm: SignatureForm;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  CANCELLED: "outline",
};

export default function FlagsTab({ signatureForm }: FlagsTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "update">("create");
  const [editing, setEditing] = useState<SignatureFlag | null>(null);
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState<string>("PENDING");
  const [comment, setComment] = useState("");
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

  const columns: Column<SignatureFlag>[] = [
    { header: "Username", accessor: "username", formatter: (v) => v || "-" },
    { header: "Full Name", accessor: "fullname", formatter: (v) => v || "-" },
    {
      header: "Status",
      accessor: "status",
      align: "center",
      formatter: (v) => (
        <Badge variant={statusVariant[v] ?? "secondary"}>{v}</Badge>
      ),
    },
    { header: "Comment", accessor: "comment", formatter: (v) => v || "-" },
  ];

  const actions: ActionConfig<SignatureFlag> = {
    onCreate: () => {
      setMode("create");
      setEditing(null);
      setUserId("");
      setStatus("PENDING");
      setComment("");
      setError("");
      setOpen(true);
    },
    onUpdate: (row) => {
      setMode("update");
      setEditing(row);
      setUserId(row.user_id);
      setStatus(row.status);
      setComment(row.comment ?? "");
      setError("");
      setOpen(true);
    },
    onDelete: async (row) => {
      try {
        await deleteSignatureFlag(signatureForm.id, row.id);
        toast.success("Flag deleted");
        setRefreshTrigger((prev) => !prev);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete flag");
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
        await createSignatureFlag(signatureForm.id, { user_id: userId, status, comment });
        toast.success("Flag added");
      } else if (editing) {
        await updateSignatureFlag(signatureForm.id, editing.id, { status, comment });
        toast.success("Flag updated");
      }
      setOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save flag");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DataTable
        fetchData={() => fetchSignatureFlags(signatureForm.id)}
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
        title={mode === "create" ? "Add Signature Flag" : "Update Signature Flag"}
        description={`Form ${signatureForm.request_id}`}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        loading={saving}
      >
        <div className="flex flex-col gap-4 p-4">
          <Field data-invalid={!!error && !userId}>
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
                disabled={mode === "update"}
                error={!!error && !userId}
              />
              <FieldError errors={error && !userId ? [{ message: error }] : undefined} />
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full"
              >
                {SIGNATURE_STATUSES.map((s) => (
                  <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Comment</FieldLabel>
              <Textarea
                rows={3}
                placeholder="Optional comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </FieldContent>
          </Field>
        </div>
      </DataDialog>
    </>
  );
}