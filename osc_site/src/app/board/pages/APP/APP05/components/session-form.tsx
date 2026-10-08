"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import DataDialog from "@/uix/datadialog";
import { Input } from "@/uix/input";
import SearchSelect from "@/uix/search-select";
import { NativeSelect, NativeSelectOption } from "@/uix/native-select";
import { Textarea } from "@/uix/textarea";
import { Field, FieldLabel, FieldContent, FieldError } from "@/uix/field";
import { SESSION_STATUSES, sessionSchema, type SessionFormValues } from "../schemas";
import { createSession, updateSession, fetchUserOptions, type UserSession } from "../api";

interface SessionFormProps {
  isOpen: boolean;
  mode: "create" | "update";
  session: UserSession | null;
  onClose: () => void;
  onSaved: () => void;
}

function defaultValues(s: UserSession | null): SessionFormValues {
  return {
    user_id: s?.user_id ?? "",
    session_token: s?.session_token ?? "",
    ip_address: s?.ip_address ?? "",
    user_agent: s?.user_agent ?? "",
    status: (s?.status as SessionFormValues["status"]) ?? "ACTIVE",
    policy_id: s?.policy_id ?? "",
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

export default function SessionForm({ isOpen, mode, session, onClose, onSaved }: SessionFormProps) {
  const [values, setValues] = useState<SessionFormValues>(() => defaultValues(session));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; name: string }>>([]);

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
    if (isOpen) load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const set = <K extends keyof SessionFormValues>(key: K, value: SessionFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit() {
    const parsed = sessionSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (mode === "create") {
        await createSession(parsed.data);
        toast.success("Session created");
      } else if (session) {
        const { ip_address, user_agent, status, policy_id } = parsed.data;
        await updateSession(session.id, { ip_address, user_agent, status, policy_id });
        toast.success("Session updated");
      }
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DataDialog
      isOpen={isOpen}
      mode={mode}
      title={mode === "create" ? "Create Session" : "Update Session"}
      description={mode === "create" ? "Add a login session" : `Edit session ${session?.session_token.slice(0, 12) ?? ""}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div className="flex flex-col gap-4 p-4">
        <Field data-invalid={!!errors.user_id}>
          <FieldContent>
            <FieldLabel>User</FieldLabel>
            <SearchSelect
              items={userOptions}
              value={values.user_id || null}
              onValueChange={(v) => set("user_id", v ?? "")}
              placeholder="Select user"
              disabled={mode === "update"}
            />
            <FieldError errors={errors.user_id ? [{ message: errors.user_id }] : undefined} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!errors.session_token}>
          <FieldContent>
            <FieldLabel>Session Token</FieldLabel>
            <Input
              placeholder="token"
              value={values.session_token}
              onChange={(e) => set("session_token", e.target.value)}
              disabled={mode === "update"}
              aria-invalid={!!errors.session_token}
            />
            <FieldError errors={errors.session_token ? [{ message: errors.session_token }] : undefined} />
          </FieldContent>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldContent>
              <FieldLabel>IP Address</FieldLabel>
              <Input
                placeholder="e.g. 127.0.0.1"
                value={values.ip_address}
                onChange={(e) => set("ip_address", e.target.value)}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect
                value={values.status}
                onChange={(e) => set("status", e.target.value as SessionFormValues["status"])}
                className="w-full"
              >
                {SESSION_STATUSES.map((s) => (
                  <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FieldContent>
          </Field>
        </div>

        <Field>
          <FieldContent>
            <FieldLabel>Policy ID</FieldLabel>
            <Input
              placeholder="optional"
              value={values.policy_id}
              onChange={(e) => set("policy_id", e.target.value)}
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
      </div>
    </DataDialog>
  );
}