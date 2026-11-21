"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Feedback } from "@/components/features/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { ApiError, message, workspaceApi } from "@/services/api";
import { useWorkspaceStore } from "@/stores/workspace";
import { switchContextFormSchema, type CompanyContext } from "@/validations/tenant.schema";

export function CompanySwitcher() {
  const activeCompany = useWorkspaceStore((state) => state.activeCompany);
  const activeArea = useWorkspaceStore((state) => state.activeArea);
  const [companies, setCompanies] = useState<CompanyContext[]>([]);
  const [directoryError, setDirectoryError] = useState("");
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof switchContextFormSchema>>({
    resolver: zodResolver(switchContextFormSchema), defaultValues: { company_id: "", area_id: "" },
  });
  const selectedId = useWatch({ control: form.control, name: "company_id" });
  const selected = companies.find((company) => company.id === selectedId);
  const company = companies.find((item) => item.id === activeCompany);
  const area = company?.areas.find((item) => item.id === activeArea);
  const busy = form.formState.isSubmitting;

  useEffect(() => {
    const controller = new AbortController();
    workspaceApi.contexts(controller.signal).then((items) => {
      if (!controller.signal.aborted) setCompanies(items);
    }).catch((failure) => {
      if (!controller.signal.aborted) setDirectoryError(message(failure));
    });
    return () => controller.abort();
  }, [revision]);

  const submit = form.handleSubmit(async (values) => {
    setError("");
    if (!selected || (!values.area_id && !selected.company_wide)) {
      form.setError("area_id", { message: "Pilih area yang dapat diakses." });
      return;
    }
    try {
      await workspaceApi.switchContext({ ...values, area_id: values.area_id || null });
      window.location.replace("/");
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) window.location.replace("/login");
      else setError(message(failure));
    }
  });

  return <Dialog open={open} onOpenChange={(next) => {
    if (busy) return;
    if (next) {
      form.reset({ company_id: activeCompany || "", area_id: activeArea || "" });
      setError("");
    }
    setOpen(next);
  }}>
    <DialogTrigger render={<Button variant="outline" size="sm" aria-label="Ganti company dan area" />}>
      <Building2 />
      <span className="hidden max-w-52 truncate sm:block">
        {company?.name || "Company"} · {area?.name || (activeArea ? "Area aktif" : "Semua area")}
      </span>
    </DialogTrigger>
    <DialogContent>
      <DialogTitle className="text-lg font-semibold">Ganti company dan area</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted">Pilih cakupan data pada workspace.</DialogDescription>
      <form noValidate onSubmit={submit} className="mt-5 space-y-4">
        <fieldset disabled={busy} className="space-y-3">
          <div className="space-y-1.5 text-sm">
            <p className="font-medium">Company</p>
            <Controller name="company_id" control={form.control} render={({ field, fieldState }) => <>
              <Select label="Company" value={field.value} options={[
                { value: "", label: "Pilih company", disabled: true },
                ...companies.map(({ id, name }) => ({ value: id, label: name })),
              ]} onChange={(value) => { field.onChange(value); form.resetField("area_id", { defaultValue: "" }); }}
              onBlur={field.onBlur} triggerRef={field.ref} invalid={!!fieldState.error} disabled={busy} />
              {fieldState.error && <p role="alert" className="text-danger">Pilih company.</p>}
            </>} />
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="font-medium">Area</p>
            <Controller name="area_id" control={form.control} render={({ field, fieldState }) => <>
              <Select label="Area" value={field.value} options={[
                { value: "", label: selected?.company_wide ? "Semua area" : "Pilih area", disabled: !selected?.company_wide },
                ...(selected?.areas.map(({ id, name }) => ({ value: id, label: name })) || []),
              ]} onChange={field.onChange} onBlur={field.onBlur} triggerRef={field.ref} invalid={!!fieldState.error}
              disabled={busy || !selected} />
              {fieldState.error && <p role="alert" className="text-danger">{fieldState.error.message}</p>}
            </>} />
          </div>
        </fieldset>
        {directoryError && <div className="space-y-2">
          <Feedback error={directoryError} />
          <Button variant="outline" type="button" onClick={() => { setDirectoryError(""); setRevision(revision + 1); }}>Muat ulang daftar</Button>
        </div>}
        <Feedback error={error} />
        <Button type="submit" disabled={busy || !selected}>{busy ? "Menerapkan…" : "Terapkan"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
