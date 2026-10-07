"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataDialog from "@/uix/datadialog";
import { Input } from "@/uix/input";
import { Textarea } from "@/uix/textarea";
import { Switch } from "@/uix/switch";
import {
  Field, FieldLabel, FieldContent, FieldError,
} from "@/uix/field";
import { companySchema, type CompanyFormValues } from "../schemas";
import { createCompany, updateCompany, type APP02Company } from "../api";

interface CompanyFormProps {
  isOpen: boolean;
  mode: "create" | "update";
  company: APP02Company | null;
  onClose: () => void;
  onSaved: () => void;
}

function defaultValues(company: APP02Company | null): CompanyFormValues {
  return {
    code: company?.code ?? "",
    name: company?.name ?? "",
    valuta: company?.valuta ?? "IDR",
    vat_id: company?.vat_id ?? "",
    reg_no: company?.reg_no ?? "",
    address: company?.address ?? "",
    tax_office: company?.tax_office ?? "",
    hris_link: company?.hris_link ?? "",
    is_active: company?.is_active ?? true,
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

export default function CompanyForm({ isOpen, mode, company, onClose, onSaved }: CompanyFormProps) {
  const [values, setValues] = useState<CompanyFormValues>(() => defaultValues(company));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setValues(defaultValues(company));
  }, [isOpen, company]);

  const set = <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit() {
    const parsed = companySchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (mode === "create") {
        await createCompany(parsed.data);
        toast.success("Company created");
      } else if (company) {
        const body: Record<string, unknown> = { ...parsed.data };
        for (const key of ["vat_id", "reg_no", "address", "tax_office", "hris_link"] as const) {
          if (typeof body[key] === "string" && body[key] === "") {
            delete body[key];
          }
        }
        await updateCompany(company.id, body);
        toast.success("Company updated");
      }
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save company");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DataDialog
      isOpen={isOpen}
      mode={mode}
      title={mode === "create" ? "Create Company" : "Update Company"}
      description={mode === "create" ? "Add a new company" : `Edit company ${company?.code ?? ""}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.code}>
            <FieldContent>
              <FieldLabel>Code</FieldLabel>
              <Input
                placeholder="Company code (unique)"
                value={values.code}
                onChange={(e) => set("code", e.target.value)}
                aria-invalid={!!errors.code}
              />
              <FieldError errors={errors.code ? [{ message: errors.code }] : undefined} />
            </FieldContent>
          </Field>

          <Field data-invalid={!!errors.valuta}>
            <FieldContent>
              <FieldLabel>Valuta</FieldLabel>
              <Input
                placeholder="IDR"
                value={values.valuta}
                onChange={(e) => set("valuta", e.target.value)}
                aria-invalid={!!errors.valuta}
              />
              <FieldError errors={errors.valuta ? [{ message: errors.valuta }] : undefined} />
            </FieldContent>
          </Field>
        </div>

        <Field data-invalid={!!errors.name}>
          <FieldContent>
            <FieldLabel>Name</FieldLabel>
            <Input
              placeholder="Company name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errors.name}
            />
            <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
          </FieldContent>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldContent>
              <FieldLabel>VAT ID</FieldLabel>
              <Input
                placeholder="VAT ID"
                value={values.vat_id ?? ""}
                onChange={(e) => set("vat_id", e.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldContent>
              <FieldLabel>Reg No</FieldLabel>
              <Input
                placeholder="Registration number"
                value={values.reg_no ?? ""}
                onChange={(e) => set("reg_no", e.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldContent>
              <FieldLabel>Tax Office</FieldLabel>
              <Input
                placeholder="Tax office"
                value={values.tax_office ?? ""}
                onChange={(e) => set("tax_office", e.target.value)}
              />
            </FieldContent>
          </Field>
        </div>

        <Field>
          <FieldContent>
            <FieldLabel>Address</FieldLabel>
            <Textarea
              placeholder="Company address"
              value={values.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldContent>
            <FieldLabel>HRIS Link</FieldLabel>
            <Input
              placeholder="https://..."
              value={values.hris_link ?? ""}
              onChange={(e) => set("hris_link", e.target.value)}
            />
          </FieldContent>
        </Field>

        <Field orientation="horizontal">
          <FieldLabel>Is Active</FieldLabel>
          <FieldContent>
            <Switch
              checked={values.is_active}
              onCheckedChange={(checked) => set("is_active", checked)}
            />
          </FieldContent>
        </Field>
      </div>
    </DataDialog>
  );
}
