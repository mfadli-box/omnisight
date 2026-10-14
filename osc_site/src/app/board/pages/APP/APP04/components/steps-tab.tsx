"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataTable, { type Column, type ActionConfig } from "@/uix/datatable";
import DataDialog from "@/uix/datadialog";
import { Input } from "@/uix/input";
import { NativeSelect, NativeSelectOption } from "@/uix/native-select";
import { Badge } from "@/uix/badge";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { STEP_CONDITIONS, approvalStepSchema, type ApprovalStepFormValues } from "../schemas";
import {
  fetchApprovalSteps, createApprovalStep, updateApprovalStep, deleteApprovalStep,
  type ApprovalStep, type SignatureType,
} from "../api";

interface StepsTabProps {
  signatureType: SignatureType;
  onSelectStep: (step: ApprovalStep | null) => void;
  selectedStepId?: string;
}

const conditionVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ANY_APPROVED: "outline",
  ALL_APPROVED: "default",
};

function defaultValues(step: ApprovalStep | null): ApprovalStepFormValues {
  return {
    step: step?.step ?? 1,
    condition: (step?.condition as ApprovalStepFormValues["condition"]) ?? "ANY_APPROVED",
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

export default function StepsTab({ signatureType, onSelectStep, selectedStepId }: StepsTabProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "update">("create");
  const [editing, setEditing] = useState<ApprovalStep | null>(null);
  const [values, setValues] = useState<ApprovalStepFormValues>(() => defaultValues(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const columns: Column<ApprovalStep>[] = [
    { header: "Step", accessor: "step", sortable: true },
    {
      header: "Condition",
      accessor: "condition",
      align: "center",
      formatter: (v) => (
        <Badge variant={conditionVariant[v] ?? "secondary"}>{v}</Badge>
      ),
    },
    {
      header: "Signers",
      accessor: "id",
      formatter: () => <span className="text-muted-foreground">See below</span>,
    },
  ];

  const actions: ActionConfig<ApprovalStep> = {
    onCreate: () => {
      setMode("create");
      setEditing(null);
      setValues(defaultValues(null));
      setErrors({});
      setOpen(true);
    },
    onUpdate: (row) => {
      setMode("update");
      setEditing(row);
      setValues(defaultValues(row));
      setErrors({});
      setOpen(true);
    },
    onDelete: async (row) => {
      try {
        await deleteApprovalStep(signatureType.id, row.id);
        toast.success("Approval step deleted");
        if (selectedStepId === row.id) {
          onSelectStep(null);
        }
        setRefreshTrigger((prev) => !prev);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete approval step");
      }
    },
    onSelect: (row) => onSelectStep(row),
    hideDetail: true,
  };

  const set = <K extends keyof ApprovalStepFormValues>(key: K, value: ApprovalStepFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit() {
    const parsed = approvalStepSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        await createApprovalStep(signatureType.id, parsed.data);
        toast.success("Approval step created");
      } else if (editing) {
        await updateApprovalStep(signatureType.id, editing.id, parsed.data);
        toast.success("Approval step updated");
      }
      setOpen(false);
      setRefreshTrigger((prev) => !prev);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save approval step");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DataTable
        fetchData={() => fetchApprovalSteps(signatureType.id)}
        columns={columns}
        actions={actions}
        hideSearch
        hidePaging
        hideColumnToggle
        refreshTrigger={refreshTrigger}
      />
      <DataDialog
        isOpen={open}
        mode={mode}
        title={mode === "create" ? "Create Approval Step" : "Update Approval Step"}
        description={`${signatureType.code} - step ${editing?.step ?? ""}`}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        loading={saving}
      >
        <div className="flex flex-col gap-4 p-4">
          <Field data-invalid={!!errors.step}>
            <FieldContent>
              <FieldLabel>Step</FieldLabel>
              <Input
                type="number"
                min={1}
                placeholder="1"
                value={values.step}
                onChange={(e) => set("step", Number(e.target.value))}
                aria-invalid={!!errors.step}
              />
              <FieldError errors={errors.step ? [{ message: errors.step }] : undefined} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!errors.condition}>
            <FieldContent>
              <FieldLabel>Condition</FieldLabel>
              <NativeSelect
                className="w-full"
                value={values.condition}
                onChange={(e) => set("condition", e.target.value as ApprovalStepFormValues["condition"])}
              >
                {STEP_CONDITIONS.map((c) => (
                  <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={errors.condition ? [{ message: errors.condition }] : undefined} />
            </FieldContent>
          </Field>
        </div>
      </DataDialog>
    </>
  );
}