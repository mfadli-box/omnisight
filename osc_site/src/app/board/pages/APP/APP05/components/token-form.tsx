"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataDialog from "@/uix/datadialog";
import SearchSelect from "@/uix/search-select";
import { Input } from "@/uix/input";
import { Textarea } from "@/uix/textarea";
import { NativeSelect, NativeSelectOption } from "@/uix/native-select";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { useEffect } from "react";
import { TOKEN_TYPES, tokenSchema, type TokenFormValues } from "../schemas";
import { createToken, updateToken, fetchUserOptions, type UserToken } from "../api";

interface TokenFormProps {
  isOpen: boolean;
  mode: "create" | "update";
  token: UserToken | null;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 16);
}

function defaultValues(t: UserToken | null): TokenFormValues {
  return {
    user_id: t?.user_id ?? "",
    token_type: (t?.token_type as TokenFormValues["token_type"]) ?? "JWT",
    token: t?.token ?? "",
    refresh_token: t?.refresh_token ?? "",
    fingerprint: t?.fingerprint ?? "",
    ip_address: t?.ip_address ?? "",
    user_agent: t?.user_agent ?? "",
    device_id: t?.device_id ?? "",
    access_expires_at: toLocalInput(t?.access_expires_at),
    refresh_expires_at: toLocalInput(t?.refresh_expires_at),
    is_blocked: t?.is_blocked ?? false,
    blocked_reason: t?.blocked_reason ?? "",
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

export default function TokenForm({ isOpen, mode, token, onClose, onSaved }: TokenFormProps) {
  const [values, setValues] = useState<TokenFormValues>(() => defaultValues(token));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [revokedReason, setRevokedReason] = useState("");
  const [revoke, setRevoke] = useState(false);

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

  const set = <K extends keyof TokenFormValues>(key: K, value: TokenFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit() {
    const parsed = tokenSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (mode === "create") {
        await createToken({ ...parsed.data, token_type: parsed.data.token_type });
        toast.success("Token created");
      } else if (token) {
        await updateToken(token.id, { ...parsed.data, revoke, revoked_reason: revokedReason });
        toast.success("Token updated");
      }
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save token");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DataDialog
      isOpen={isOpen}
      mode={mode}
      title={mode === "create" ? "Create Token" : "Update Token"}
      description={mode === "create" ? "Add a new auth token" : `Edit token ${token?.token.slice(0, 16) ?? ""}…`}
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.user_id}>
            <FieldContent>
              <FieldLabel>User</FieldLabel>
              <SearchSelect
                items={userOptions}
                value={values.user_id || null}
                onValueChange={(v) => set("user_id", v ?? "")}
                placeholder="Select user"
                disabled={mode === "update"}
                error={!!errors.user_id}
              />
              <FieldError errors={errors.user_id ? [{ message: errors.user_id }] : undefined} />
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Type</FieldLabel>
              <NativeSelect
                value={values.token_type}
                onChange={(e) => set("token_type", e.target.value as TokenFormValues["token_type"])}
                className="w-full"
              >
                {TOKEN_TYPES.map((t) => (
                  <NativeSelectOption key={t} value={t}>{t}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FieldContent>
          </Field>
        </div>

        <Field data-invalid={!!errors.token}>
          <FieldContent>
            <FieldLabel>Token</FieldLabel>
            <Input
              placeholder="token value"
              value={values.token}
              onChange={(e) => set("token", e.target.value)}
              disabled={mode === "update"}
              aria-invalid={!!errors.token}
            />
            <FieldError errors={errors.token ? [{ message: errors.token }] : undefined} />
          </FieldContent>
        </Field>

        <Field>
          <FieldContent>
            <FieldLabel>Refresh Token</FieldLabel>
            <Input
              placeholder="optional"
              value={values.refresh_token}
              onChange={(e) => set("refresh_token", e.target.value)}
            />
          </FieldContent>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.access_expires_at}>
            <FieldContent>
              <FieldLabel>Access Expires At</FieldLabel>
              <Input
                type="datetime-local"
                value={values.access_expires_at}
                onChange={(e) => set("access_expires_at", e.target.value)}
                aria-invalid={!!errors.access_expires_at}
              />
              <FieldError errors={errors.access_expires_at ? [{ message: errors.access_expires_at }] : undefined} />
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Refresh Expires At</FieldLabel>
              <Input
                type="datetime-local"
                value={values.refresh_expires_at}
                onChange={(e) => set("refresh_expires_at", e.target.value)}
              />
            </FieldContent>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldContent>
              <FieldLabel>IP Address</FieldLabel>
              <Input
                placeholder="optional"
                value={values.ip_address}
                onChange={(e) => set("ip_address", e.target.value)}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Device ID</FieldLabel>
              <Input
                placeholder="optional"
                value={values.device_id}
                onChange={(e) => set("device_id", e.target.value)}
              />
            </FieldContent>
          </Field>
        </div>

        <Field>
          <FieldContent>
            <FieldLabel>Fingerprint</FieldLabel>
            <Input
              placeholder="optional"
              value={values.fingerprint}
              onChange={(e) => set("fingerprint", e.target.value)}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldContent>
            <FieldLabel>User Agent</FieldLabel>
            <Textarea
              placeholder="optional"
              value={values.user_agent}
              onChange={(e) => set("user_agent", e.target.value)}
            />
          </FieldContent>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldContent>
              <FieldLabel>Blocked</FieldLabel>
              <NativeSelect
                value={values.is_blocked ? "true" : "false"}
                onChange={(e) => set("is_blocked", e.target.value === "true")}
                className="w-full"
              >
                <NativeSelectOption value="false">No</NativeSelectOption>
                <NativeSelectOption value="true">Yes</NativeSelectOption>
              </NativeSelect>
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Blocked Reason</FieldLabel>
              <Input
                placeholder="optional"
                value={values.blocked_reason}
                onChange={(e) => set("blocked_reason", e.target.value)}
              />
            </FieldContent>
          </Field>
        </div>

        {mode === "update" && (
          <div className="grid grid-cols-1 gap-4 rounded-md border border-dashed p-3 sm:grid-cols-2">
            <Field>
              <FieldContent>
                <FieldLabel>Revoke now</FieldLabel>
                <NativeSelect
                  value={revoke ? "true" : "false"}
                  onChange={(e) => setRevoke(e.target.value === "true")}
                  className="w-full"
                  disabled={!!token?.revoked_at}
                >
                  <NativeSelectOption value="false">No</NativeSelectOption>
                  <NativeSelectOption value="true">Yes</NativeSelectOption>
                </NativeSelect>
              </FieldContent>
            </Field>

            <Field>
              <FieldContent>
                <FieldLabel>Revoked Reason</FieldLabel>
                <Input
                  placeholder="optional"
                  value={revokedReason}
                  onChange={(e) => setRevokedReason(e.target.value)}
                />
              </FieldContent>
            </Field>
          </div>
        )}
      </div>
    </DataDialog>
  );
}