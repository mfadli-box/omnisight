"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataDialog from "@/uix/datadialog";
import { Input } from "@/uix/input";
import { Switch } from "@/uix/switch";
import SearchSelect from "@/uix/search-select";
import {
  Field, FieldLabel, FieldContent, FieldError,
} from "@/uix/field";
import { moduleSchema, type ModuleFormValues } from "../schemas";
import { createModule, updateModule, fetchRootModuleOptions, type APP01Module } from "../api";

interface ModuleFormProps {
  isOpen: boolean;
  mode: "create" | "update";
  module: APP01Module | null;
  onClose: () => void;
  onSaved: () => void;
}

function defaultValues(module: APP01Module | null): ModuleFormValues {
  return {
    parent_id: module?.parent_id ?? "",
    code: module?.code ?? "",
    name: module?.name ?? "",
    path: module?.path ?? "",
    is_page: module?.is_page ?? false,
    is_active: module?.is_active ?? true,
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

export default function ModuleForm({ isOpen, mode, module, onClose, onSaved }: ModuleFormProps) {
  const [values, setValues] = useState<ModuleFormValues>(() => defaultValues(module));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [parentOptions, setParentOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    setValues(defaultValues(module));
  }, [isOpen, module]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const opts = await fetchRootModuleOptions();
        if (!cancelled) {
          setParentOptions(opts.filter((opt) => opt.id !== module?.id));
        }
      } catch {
        if (!cancelled) {
          setParentOptions([]);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [module?.id]);

  const set = <K extends keyof ModuleFormValues>(key: K, value: ModuleFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit() {
    const parsed = moduleSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const body: Record<string, unknown> = { ...parsed.data };
      if (typeof body.parent_id === "string" && body.parent_id === "") {
        delete body.parent_id;
      }
      if (mode === "create") {
        await createModule(body);
        toast.success("Module created");
      } else if (module) {
        await updateModule(module.id, body);
        toast.success("Module updated");
      }
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save module");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DataDialog
      isOpen={isOpen}
      mode={mode}
      title={mode === "create" ? "Create Module" : "Update Module"}
      description={mode === "create" ? "Add a new module" : `Edit module ${module?.code ?? ""}`}
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
                placeholder="Module code"
                value={values.code}
                onChange={(e) => set("code", e.target.value)}
                aria-invalid={!!errors.code}
                disabled={mode === "update"}
              />
              <FieldError errors={errors.code ? [{ message: errors.code }] : undefined} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!errors.path}>
            <FieldContent>
              <FieldLabel>Path</FieldLabel>
              <Input
                placeholder="/board/pages/APP/APP01"
                value={values.path}
                onChange={(e) => set("path", e.target.value)}
                aria-invalid={!!errors.path}
              />
              <FieldError errors={errors.path ? [{ message: errors.path }] : undefined} />
            </FieldContent>
          </Field>
        </div>

        <Field data-invalid={!!errors.name}>
          <FieldContent>
            <FieldLabel>Name</FieldLabel>
            <Input
              placeholder="Module name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errors.name}
            />
            <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
          </FieldContent>
        </Field>

        <Field>
          <FieldContent>
            <FieldLabel>Parent Module</FieldLabel>
            <SearchSelect
              items={parentOptions}
              value={values.parent_id || null}
              onValueChange={(v) => set("parent_id", v ?? "")}
              placeholder="No parent (root)"
              disabled={mode === "update"}
            />
          </FieldContent>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field orientation="horizontal">
            <FieldLabel>Is Page</FieldLabel>
            <FieldContent>
              <Switch
                checked={values.is_page}
                onCheckedChange={(checked) => set("is_page", checked)}
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
      </div>
    </DataDialog>
  );
}
