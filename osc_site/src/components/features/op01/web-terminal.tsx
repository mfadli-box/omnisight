"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { message } from "@/services/api";
import { opsApi, streamOps } from "@/services/ops";
import { terminalCommandSchema, terminalFormSchema, type terminalNodeSchema } from "@/validations/ops.schema";
import { Feedback, FormField } from "../shared/form-feedback";
import { OpsOutput, opsStatus } from "../shared/ops-output";

type Node = z.infer<typeof terminalNodeSchema>;

export function WebTerminal() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nextNode, setNextNode] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [output, setOutput] = useState("");
  const submission = useRef<AbortController>(null);
  const list = useRef<AbortController>(null);
  const form = useForm<z.infer<typeof terminalFormSchema>>({
    resolver: zodResolver(terminalFormSchema), defaultValues: { node_id: "", command: "uptime", otp: "" },
  });
  const busy = form.formState.isSubmitting;

  async function load(after?: string) {
    list.current?.abort();
    const request = new AbortController();
    list.current = request;
    setLoading(true);
    setError("");
    try {
      const page = await opsApi.nodes(after, request.signal);
      if (request.signal.aborted) return;
      setNodes((current) => after ? [...current, ...page] : page);
      setNextNode(page.length === 100 ? page.at(-1)?.id : undefined);
    } catch (failure) {
      if (!request.signal.aborted) setError(message(failure));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { list.current?.abort(); submission.current?.abort(); };
  }, []);

  const submit = form.handleSubmit(async ({ node_id, command, otp }) => {
    if (submission.current) return;
    const request = new AbortController();
    submission.current = request;
    setError("");
    setNotice("Menunggu agent…");
    setOutput("");
    form.resetField("otp");
    try {
      const job = await opsApi.terminal({ node_id, command, otp: otp || undefined }, request.signal);
      setOutput(`$ ${command}\n`);
      const result = await streamOps(`pam/terminal/${job.job_id}/logs`, job, request.signal,
        (text) => setOutput((current) => current + text));
      if (!request.signal.aborted) setNotice(opsStatus(result));
    } catch (failure) {
      if (!request.signal.aborted) { setNotice(""); setError(message(failure)); }
    } finally {
      if (submission.current === request) submission.current = null;
    }
  });

  const selectClass = "block h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm";
  return <Card>
    <CardHeader><CardTitle>Web Terminal</CardTitle>
      <p className="text-sm text-muted">MFA harus aktif. Masukkan TOTP jika verifikasi terakhir lebih dari 15 menit.</p>
    </CardHeader>
    <CardContent className="space-y-3">
      <form noValidate onSubmit={submit} className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
        <div className="space-y-2">
          <FormField label="Node" error={form.formState.errors.node_id?.message}>
            <select className={selectClass} disabled={busy || loading} {...form.register("node_id")}>
              <option value="">{loading ? "Memuat node…" : nodes.length ? "Pilih node" : "Tidak ada node tersedia"}</option>
              {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
            </select>
          </FormField>
          {nextNode && <Button type="button" variant="outline" size="sm" disabled={loading || busy}
            onClick={() => void load(nextNode)}>Muat node lain</Button>}
        </div>
        <FormField label="Perintah" error={form.formState.errors.command?.message}>
          <select className={selectClass} disabled={busy} {...form.register("command")}>
            {terminalCommandSchema.options.map((command) => <option key={command} value={command}>{command}</option>)}
          </select>
        </FormField>
        <FormField label="TOTP 6 digit" error={form.formState.errors.otp?.message}>
          <Input type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy}
            {...form.register("otp")} />
        </FormField>
        <Button type="submit" className="lg:mt-6" disabled={busy || loading || !nodes.length}>Jalankan</Button>
      </form>
      <Feedback error={error} notice={notice} />
      <OpsOutput text={output} label="Output Web Terminal" />
    </CardContent>
  </Card>;
}
