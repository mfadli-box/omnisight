"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { isSessionExpired, forceLogout, type SessionData } from "@/lib/utility";
import { useSessionSnapshot } from "@/lib/use-session";
import { Badge } from "@/uix/badge";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldSet } from "@/uix/field";
import { Input } from "@/uix/input";

type ProfileEntry = [string, string | number | boolean | null | undefined];

const HIDDEN_PROFILE_FIELDS = new Set([
  "password",
  "company_id",
  "company_name",
  "employee_id",
  "regional_id",
  "office_id",
  "department_id",
  "division_id",
  "companies",
  "is_admin",
  "is_active",
]);
const STATUS_FIELDS = ["is_hris"] as const;
const formatLabel = (value: string) => value.replaceAll("_", " ");
const formatStatusLabel = (value: string) => value.replace(/^is_/, "").replaceAll("_", " ");
const toBoolean = (value: string | number | boolean | null | undefined) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
};

export function Board() {
  const router = useRouter();
  const session = useSessionSnapshot();
  const isHydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  useEffect(() => {
    if (!isHydrated) return;
    if (!session || isSessionExpired(session)) {
      forceLogout(router);
      return;
    }
    fetch("/proxy/pages/APP00/company", {
      headers: { Authorization: `Bearer ${session.token}` },
    }).then((res) => {
      if (res.status === 401 || res.status === 403) forceLogout(router);
    }).catch(() => forceLogout(router));
  }, [router, session, isHydrated]);
  const profileEntries = useMemo<ProfileEntry[]>(() => {
    if (!session?.user_profile) return [];
    return Object.entries(session.user_profile).filter(([key]) => {
      if (HIDDEN_PROFILE_FIELDS.has(key)) return false;
      if (STATUS_FIELDS.includes(key as (typeof STATUS_FIELDS)[number])) return false;
      return true;
    });
  }, [session]);
  const statusEntries = useMemo(() => {
    if (!session?.user_profile) return [];
    return STATUS_FIELDS.map((key) => ({
      key,
      active: toBoolean(
        session.user_profile[key as keyof SessionData["user_profile"]] as
          | string
          | number
          | boolean
          | null
          | undefined,
      ),
    }));
  }, [session]);
  return (
    <main className="p-3 max-w-8xl mx-auto">
      <FieldSet>
        <FieldGroup>
          {profileEntries.length === 0 ? (
            <Field className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3">
              <FieldLabel className="pt-2">Profile</FieldLabel>
              <FieldContent>
                <div className="flex flex-wrap items-center gap-2">
                  You are not Logged in. Please log in to view your profile information.
                </div>
              </FieldContent>
            </Field>
          ) : (
            <>
            {profileEntries.map(([key, value]) => (
              <Field key={key} className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3">
                <FieldLabel className="pt-2" htmlFor={`profile-${key}`}>
                  {formatLabel(key)}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id={`profile-${key}`}
                    name={`user_profile_${key}`}
                    value={value == null ? "" : String(value)}
                    readOnly
                  />
                </FieldContent>
              </Field>
            ))}
            </>
          )}
          <Field className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3">
            <FieldLabel className="pt-2">Status</FieldLabel>
            <FieldContent>
              <div className="flex flex-wrap items-center">
                {statusEntries.map((status) => (
                  <Badge
                    key={status.key}
                    className={
                      status.active
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 mr-2"
                        : "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300 mr-2"
                    }
                  >
                    {formatStatusLabel(status.key)}
                  </Badge>
                ))}
              </div>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </main>
  );
}
