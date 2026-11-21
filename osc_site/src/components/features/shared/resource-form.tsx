"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { resourceSchemas, type DataRow } from "@/validations/resource.schema";
import { FormField } from "./form-feedback";

export type Field = {
  key: string;
  label: string;
  type?: "number" | "email" | "password" | "textarea";
  choices?: readonly string[];
  optional?: boolean;
  createOnly?: boolean;
  min?: number;
  max?: number;
};
export type ResourcePath = keyof typeof resourceSchemas;

export function ResourceForm({ path, fields, editing, busy, save, cancel }: {
  path: ResourcePath;
  fields: Field[];
  editing: DataRow | "new";
  busy: boolean;
  save: (payload: object) => Promise<void>;
  cancel: () => void;
}) {
  const creating = editing === "new";
  const editable = fields.filter((field) => creating || !field.createOnly);
  const schemas = resourceSchemas[path];
  const validation = creating ? schemas.create : "update" in schemas ? schemas.update : schemas.create;
  const schema = z.record(z.string(), z.string()).transform((input, ctx) => {
    const payload: Record<string, string | number | null> = {};
    for (const field of editable) {
      const raw = input[field.key] ?? "";
      const value = field.type === "textarea" || field.type === "password" ? raw : raw.trim();
      if (!value && !field.optional) {
        ctx.addIssue({ code: "custom", path: [field.key], message: "Wajib diisi." });
      } else if (value || (!creating && field.type === "textarea")) {
        payload[field.key] = field.type === "number" ? Number(value) : value;
      } else if (!creating && field.type === "email") {
        payload[field.key] = null;
      }
    }
    if (ctx.issues.length) return z.NEVER;
    const checked = validation.safeParse(payload);
    if (checked.success) return checked.data;
    for (const issue of checked.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    return z.NEVER;
  });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(editable.map(({ key }) => {
      const value = creating ? "" : editing[key];
      return [key, typeof value === "string" || typeof value === "number" ? String(value) : ""];
    })),
  });

  return <form noValidate onSubmit={form.handleSubmit(save)} className="space-y-4 rounded-lg border border-border p-4">
    <h3 className="text-sm font-semibold">{creating ? "Tambah data" : "Ubah data"}</h3>
    <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
      {editable.map((field) => {
        const error = form.formState.errors[field.key]?.message;
        if (field.choices) return <div className="space-y-1.5 text-sm" key={field.key}>
          <p className="font-medium">{field.label}</p>
          <Controller name={field.key} control={form.control} render={({ field: control }) => <Select
            label={field.label} value={control.value || ""} onChange={control.onChange} onBlur={control.onBlur}
            triggerRef={control.ref} disabled={busy} invalid={!!error}
            options={[{ value: "", label: "Pilih nilai", disabled: true }, ...field.choices!.map((value) => ({ value, label: value }))]} />} />
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </div>;
        const input = form.register(field.key);
        return <div key={field.key} className={field.type === "textarea" ? "md:col-span-2" : undefined}>
          <FormField label={field.label} error={error}>
            {field.type === "textarea" ?
              <textarea {...input} rows={8} maxLength={262144} aria-invalid={!!error} className="field-control h-auto p-3 font-mono" />
              : <Input {...input} type={field.type || "text"} min={field.min} max={field.type === "number" ? field.max : undefined}
                aria-invalid={!!error} maxLength={field.type === "number" ? undefined : field.max || 255}
                autoComplete={field.type === "password" ? "new-password" : undefined} />}
          </FormField>
        </div>;
      })}
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={cancel}>Batal</Button>
    </div>
  </form>;
}
