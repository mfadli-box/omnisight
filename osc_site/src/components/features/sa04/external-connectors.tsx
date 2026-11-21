"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiData, jsonRequest, message } from "@/services/api";
import { connectorFormSchema, connectorRequestSchema, connectorSchema, providerSchema } from "@/validations/resource.schema";
import { Feedback, FormField } from "../shared/form-feedback";

type Connector = z.infer<typeof connectorSchema>;
type Values = z.infer<typeof connectorFormSchema>;
const providers = [{ value: "LOCAL", label: "Akun lokal" }, { value: "HRIS_ASMX", label: "HRIS ASMX" }];

export function ExternalConnectors({ companyId }: { companyId: string }) {
  const [connector, setConnector] = useState<Connector | null>(null);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const path = `companies/${companyId}/connector`;

  useEffect(() => {
    const controller = new AbortController();
    apiData(path, connectorSchema, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setConnector(data); })
      .catch((failure) => { if (!controller.signal.aborted) setLoadError(message(failure)); });
    return () => controller.abort();
  }, [path, revision]);

  return <Card className="max-w-2xl">
    <CardHeader><CardTitle>Provider autentikasi</CardTitle><CardDescription>Backend memeriksa allowlist host dan MFA terbaru sebelum menyimpan perubahan.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {loadError && <><Feedback error={loadError} /><Button variant="outline" onClick={() => { setLoadError(""); setRevision((count) => count + 1); }}>Coba lagi</Button></>}
      {!connector && !loadError && <p role="status">Memuat konfigurasi…</p>}
      {connector && <ConnectorForm path={path} connector={connector} onSave={setConnector} />}
    </CardContent>
  </Card>;
}

function ConnectorForm({ path, connector, onSave }: { path: string; connector: Connector; onSave: (connector: Connector) => void }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const form = useForm<Values>({
    resolver: zodResolver(connectorFormSchema),
    defaultValues: { auth_provider: connector.auth_provider, hris_cache_ttl_hours: connector.hris_cache_ttl_hours, hris_login_url: "" },
  });
  const provider = useWatch({ control: form.control, name: "auth_provider" });
  const busy = form.formState.isSubmitting;
  const save = form.handleSubmit(async ({ hris_login_url, ...values }) => {
    setError(""); setNotice("");
    try {
      const input = connectorRequestSchema.parse({ ...values, ...(values.auth_provider === "HRIS_ASMX" && { hris_login_url }) });
      const updated = await apiData(path, connectorSchema, jsonRequest("PATCH", input));
      onSave(updated);
      form.reset({ auth_provider: updated.auth_provider, hris_cache_ttl_hours: updated.hris_cache_ttl_hours, hris_login_url: "" });
      setNotice("Konfigurasi konektor disimpan.");
    } catch (failure) { setError(message(failure)); }
  });

  return <form noValidate onSubmit={save} className="space-y-4">
    <p className="text-sm text-muted">Provider aktif {connector.auth_provider}{connector.configured ? " · Endpoint HRIS terkonfigurasi" : ""}</p>
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Provider</p>
      <Controller name="auth_provider" control={form.control} render={({ field }) => <Select
        label="Provider autentikasi" options={providers} value={field.value} onChange={(value) => {
          field.onChange(providerSchema.parse(value)); form.resetField("hris_login_url");
        }} onBlur={field.onBlur} triggerRef={field.ref} disabled={busy} />} />
    </div>
    {provider === "HRIS_ASMX" && <FormField label="Template URL login HRIS" error={form.formState.errors.hris_login_url?.message}>
      <Input maxLength={2048} disabled={busy} autoComplete="off" {...form.register("hris_login_url")} />
    </FormField>}
    <FormField label="TTL cache HRIS (jam)" error={form.formState.errors.hris_cache_ttl_hours?.message}>
      <Input type="number" min={1} max={8760} disabled={busy} {...form.register("hris_cache_ttl_hours", { valueAsNumber: true })} />
    </FormField>
    <Feedback error={error} notice={notice} />
    <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan konfigurasi"}</Button>
  </form>;
}
