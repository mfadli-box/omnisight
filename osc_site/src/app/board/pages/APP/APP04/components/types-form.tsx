"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataDialog from "@/uix/datadialog";
import { Input } from "@/uix/input";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { signatureTypeSchema, type SignatureTypeFormValues } from "../schemas";
import { createSignatureType, updateSignatureType, type SignatureType } from "../api";

interface SignatureTypeFormProps {
  isOpen: boolean;
  mode: "create" | "update";
  signatureType: SignatureType | null;
  onClose: () => void;
  onSaved: () => void;
}

function defaultValues(st: SignatureType | null): SignatureTypeFormValues {
  return {
    code: st?.code ?? "",
    name: st?.name ?? "",
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

export default function SignatureTypeForm({ isOpen, mode, signatureType, onClose, onSaved }: SignatureTypeFormProps) {
  const [values, setValues] = useState<SignatureTypeFormValues>(() => defaultValues(signatureType));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof SignatureTypeFormValues>(key: K, value: SignatureTypeFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit() {
    const parsed = signatureTypeSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (mode === "create") {
        await createSignatureType(parsed.data);
        toast.success("Signature type created");
      } else if (signatureType) {
        await updateSignatureType(signatureType.id, parsed.data);
        toast.success("Signature type updated");
      }
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save signature type");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DataDialog
      isOpen={isOpen}
      mode={mode}
      title={mode === "create" ? "Create Signature Type" : "Update Signature Type"}
      description={mode === "create" ? "Add a new signature type" : `Edit type ${signatureType?.code ?? ""}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div className="flex flex-col gap-4 p-4">
        <Field data-invalid={!!errors.code}>
          <FieldContent>
            <FieldLabel>Code</FieldLabel>
            <Input
              placeholder="e.g. PO"
              value={values.code}
              onChange={(e) => set("code", e.target.value)}
              aria-invalid={!!errors.code}
            />
            <FieldError errors={errors.code ? [{ message: errors.code }] : undefined} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!errors.name}>
          <FieldContent>
            <FieldLabel>Name</FieldLabel>
            <Input
              placeholder="e.g. Purchase Order"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errors.name}
            />
            <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
          </FieldContent>
        </Field>
      </div>
    </DataDialog>
  );
}