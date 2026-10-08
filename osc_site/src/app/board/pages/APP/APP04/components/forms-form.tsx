"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataDialog from "@/uix/datadialog";
import { Input } from "@/uix/input";
import { NativeSelect, NativeSelectOption } from "@/uix/native-select";
import SearchSelect from "@/uix/search-select";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { STEP_CONDITIONS, SIGNATURE_STATUSES, signatureFormSchema, type SignatureFormFormValues } from "../schemas";
import {
  createSignatureForm, updateSignatureForm, fetchTypeOptions, type SignatureForm,
} from "../api";

interface SignatureFormFormProps {
  isOpen: boolean;
  mode: "create" | "update";
  signatureForm: SignatureForm | null;
  onClose: () => void;
  onSaved: () => void;
}

function defaultValues(sf: SignatureForm | null): SignatureFormFormValues {
  return {
    signature_type_id: sf?.signature_type_id ?? "",
    step: sf?.step ?? 1,
    request_id: sf?.request_id ?? "",
    condition: (sf?.condition as SignatureFormFormValues["condition"]) ?? "ANY_APPROVED",
    status: (sf?.status as SignatureFormFormValues["status"]) ?? "PENDING",
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

export default function SignatureFormForm({ isOpen, mode, signatureForm, onClose, onSaved }: SignatureFormFormProps) {
  const [values, setValues] = useState<SignatureFormFormValues>(() => defaultValues(signatureForm));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [typeOptions, setTypeOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const opts = await fetchTypeOptions();
        if (!cancelled) setTypeOptions(opts);
      } catch {
        if (!cancelled) setTypeOptions([]);
      }
    }
    if (isOpen) load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const set = <K extends keyof SignatureFormFormValues>(key: K, value: SignatureFormFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit() {
    const parsed = signatureFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const body = { ...parsed.data };
      if (mode === "create") {
        await createSignatureForm(body);
        toast.success("Signature form created");
      } else if (signatureForm) {
        await updateSignatureForm(signatureForm.id, body);
        toast.success("Signature form updated");
      }
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save signature form");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DataDialog
      isOpen={isOpen}
      mode={mode}
      title={mode === "create" ? "Create Signature Form" : "Update Signature Form"}
      description={mode === "create" ? "Add a new signature request" : `Edit form ${signatureForm?.request_id ?? ""}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldContent>
              <FieldLabel>Signature Type</FieldLabel>
              <SearchSelect
                items={typeOptions}
                value={values.signature_type_id || null}
                onValueChange={(v) => set("signature_type_id", v ?? "")}
                placeholder="Optional - select type"
              />
            </FieldContent>
          </Field>

          <Field data-invalid={!!errors.step}>
            <FieldContent>
              <FieldLabel>Step</FieldLabel>
              <Input
                type="number"
                min={1}
                value={values.step}
                onChange={(e) => set("step", Number(e.target.value))}
                aria-invalid={!!errors.step}
              />
              <FieldError errors={errors.step ? [{ message: errors.step }] : undefined} />
            </FieldContent>
          </Field>
        </div>

        <Field data-invalid={!!errors.request_id}>
          <FieldContent>
            <FieldLabel>Request ID</FieldLabel>
            <Input
              placeholder="e.g. REQ-001"
              value={values.request_id}
              onChange={(e) => set("request_id", e.target.value)}
              aria-invalid={!!errors.request_id}
            />
            <FieldError errors={errors.request_id ? [{ message: errors.request_id }] : undefined} />
          </FieldContent>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.condition}>
            <FieldContent>
              <FieldLabel>Condition</FieldLabel>
              <NativeSelect
                value={values.condition}
                onChange={(e) => set("condition", e.target.value as SignatureFormFormValues["condition"])}
                className="w-full"
              >
                {STEP_CONDITIONS.map((c) => (
                  <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FieldContent>
          </Field>

          <Field data-invalid={!!errors.status}>
            <FieldContent>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect
                value={values.status}
                onChange={(e) => set("status", e.target.value as SignatureFormFormValues["status"])}
                className="w-full"
              >
                {SIGNATURE_STATUSES.map((s) => (
                  <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FieldContent>
          </Field>
        </div>
      </div>
    </DataDialog>
  );
}