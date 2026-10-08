"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataDialog from "@/uix/datadialog";
import { Input } from "@/uix/input";
import { Switch } from "@/uix/switch";
import { NativeSelect, NativeSelectOption } from "@/uix/native-select";
import SearchSelect from "@/uix/search-select";
import {
  Field, FieldLabel, FieldContent, FieldError,
} from "@/uix/field";
import { userSchema, type UserFormValues } from "../schemas";
import { createUser, updateUser, fetchCompanyOptions, type APP03User } from "../api";

interface UserFormProps {
  isOpen: boolean;
  mode: "create" | "update";
  user: APP03User | null;
  onClose: () => void;
  onSaved: () => void;
}

function defaultValues(user: APP03User | null): UserFormValues {
  return {
    username: user?.username ?? "",
    email: user?.email ?? "",
    password: "",
    fullname: user?.fullname ?? "",
    phone: user?.phone ?? "",
    company_id: user?.company_id ?? "",
    employee_id: user?.employee_id ?? "",
    location_id: user?.location_id ?? "",
    department_id: user?.department_id ?? "",
    division_id: user?.division_id ?? "",
    role: user?.role ?? "staff",
    job: user?.job ?? "",
    key: user?.key ?? "",
    is_admin: user?.is_admin ?? false,
    is_hris: user?.is_hris ?? false,
    is_active: user?.is_active ?? true,
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

export default function UserForm({ isOpen, mode, user, onClose, onSaved }: UserFormProps) {
  const [values, setValues] = useState<UserFormValues>(() => defaultValues(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<Array<{ id: string; name: string }>>([]);

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
    if (isOpen) load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const set = <K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit() {
    if (mode === "create" && !values.password) {
      setErrors({ password: "Password is required" });
      return;
    }
    const parsed = userSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const body: Record<string, unknown> = { ...parsed.data };
      delete body.password;
      if (parsed.data.password) {
        body.password = parsed.data.password;
      }
      for (const key of ["phone", "employee_id", "location_id", "department_id", "division_id", "job", "key"] as const) {
        if (typeof body[key] === "string" && body[key] === "") {
          delete body[key];
        }
      }
      if (mode === "create") {
        await createUser(body);
        toast.success("User created");
      } else if (user) {
        await updateUser(user.id, body);
        toast.success("User updated");
      }
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DataDialog
      isOpen={isOpen}
      mode={mode}
      title={mode === "create" ? "Create User" : "Update User"}
      description={mode === "create" ? "Add a new user" : `Edit user ${user?.username ?? ""}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.username}>
            <FieldContent>
              <FieldLabel>Username</FieldLabel>
              <Input
                placeholder="Login username"
                value={values.username}
                onChange={(e) => set("username", e.target.value)}
                aria-invalid={!!errors.username}
              />
              <FieldError errors={errors.username ? [{ message: errors.username }] : undefined} />
            </FieldContent>
          </Field>

          <Field data-invalid={!!errors.email}>
            <FieldContent>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                placeholder="user@example.com"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                aria-invalid={!!errors.email}
              />
              <FieldError errors={errors.email ? [{ message: errors.email }] : undefined} />
            </FieldContent>
          </Field>
        </div>

        <Field data-invalid={!!errors.password}>
          <FieldContent>
            <FieldLabel>Password</FieldLabel>
            <Input
              type="password"
              placeholder={mode === "create" ? "Password" : "Leave blank to keep current"}
              value={values.password ?? ""}
              onChange={(e) => set("password", e.target.value)}
              aria-invalid={!!errors.password}
            />
            <FieldError errors={errors.password ? [{ message: errors.password }] : undefined} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!errors.fullname}>
          <FieldContent>
            <FieldLabel>Full Name</FieldLabel>
            <Input
              placeholder="Full name"
              value={values.fullname}
              onChange={(e) => set("fullname", e.target.value)}
              aria-invalid={!!errors.fullname}
            />
            <FieldError errors={errors.fullname ? [{ message: errors.fullname }] : undefined} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!errors.company_id}>
          <FieldContent>
            <FieldLabel>Company</FieldLabel>
            <SearchSelect
              items={companyOptions}
              value={values.company_id || null}
              onValueChange={(v) => {
                set("company_id", v ?? "");
                setErrors((prev) => ({ ...prev, company_id: "" }));
              }}
              placeholder="Select company"
              error={!!errors.company_id}
            />
            <FieldError errors={errors.company_id ? [{ message: errors.company_id }] : undefined} />
          </FieldContent>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <FieldContent>
              <FieldLabel>Phone</FieldLabel>
              <Input
                placeholder="Phone"
                value={values.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </FieldContent>
          </Field>

          <Field data-invalid={!!errors.role}>
            <FieldContent>
              <FieldLabel>Role</FieldLabel>
              <NativeSelect
                value={values.role}
                onChange={(e) => set("role", e.target.value)}
                aria-invalid={!!errors.role}
                className="w-full"
              >
                <NativeSelectOption value="staff">Staff</NativeSelectOption>
                <NativeSelectOption value="manager">Manager</NativeSelectOption>
                <NativeSelectOption value="supervisor">Supervisor</NativeSelectOption>
                <NativeSelectOption value="director">Director</NativeSelectOption>
              </NativeSelect>
              <FieldError errors={errors.role ? [{ message: errors.role }] : undefined} />
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Job</FieldLabel>
              <Input
                placeholder="Job title"
                value={values.job ?? ""}
                onChange={(e) => set("job", e.target.value)}
              />
            </FieldContent>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field>
            <FieldContent>
              <FieldLabel>Employee ID</FieldLabel>
              <Input
                placeholder="Employee ID"
                value={values.employee_id ?? ""}
                onChange={(e) => set("employee_id", e.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldContent>
              <FieldLabel>Location ID</FieldLabel>
              <Input
                placeholder="Location ID"
                value={values.location_id ?? ""}
                onChange={(e) => set("location_id", e.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldContent>
              <FieldLabel>Department ID</FieldLabel>
              <Input
                placeholder="Department ID"
                value={values.department_id ?? ""}
                onChange={(e) => set("department_id", e.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldContent>
              <FieldLabel>Division ID</FieldLabel>
              <Input
                placeholder="Division ID"
                value={values.division_id ?? ""}
                onChange={(e) => set("division_id", e.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldContent>
              <FieldLabel>Key</FieldLabel>
              <Input
                placeholder="Key"
                value={values.key ?? ""}
                onChange={(e) => set("key", e.target.value)}
              />
            </FieldContent>
          </Field>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Field orientation="horizontal">
            <FieldLabel>Is Admin</FieldLabel>
            <FieldContent>
              <Switch checked={values.is_admin} onCheckedChange={(checked) => set("is_admin", checked)} />
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel>Is HRIS</FieldLabel>
            <FieldContent>
              <Switch checked={values.is_hris} onCheckedChange={(checked) => set("is_hris", checked)} />
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel>Is Active</FieldLabel>
            <FieldContent>
              <Switch checked={values.is_active} onCheckedChange={(checked) => set("is_active", checked)} />
            </FieldContent>
          </Field>
        </div>
      </div>
    </DataDialog>
  );
}