"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { message } from "@/services/api";
import { opsApi, streamOps } from "@/services/ops";
import {
  composeFormSchema, runCommandSchema, stackCreateSchema, type stackActionSchema, type stackSchema,
} from "@/validations/ops.schema";
import { Feedback, FormField } from "../shared/form-feedback";
import { OpsOutput, opsStatus } from "../shared/ops-output";
import { AgentStatus } from "../shared/agent-status";

type Stack = z.infer<typeof stackSchema>;
type StackAction = z.infer<typeof stackActionSchema>;
const sample = "services:\n  web:\n    image: nginx:alpine\n";
const labels: Record<Stack["status"], string> = {
  NEW: "Baru", READY: "Siap", RUNNING: "Berjalan", STOPPED: "Berhenti", ERROR: "Kesalahan",
};

export function ComposeStacks() {
  const [rows, setRows] = useState<Stack[]>([]);
  const [selected, select] = useState<string>();
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRequest = useRef<AbortController>(null);
  const form = useForm<z.infer<typeof stackCreateSchema>>({
    resolver: zodResolver(stackCreateSchema), defaultValues: { stack_name: "", node_id: "" },
  });
  const load = useCallback(async (after?: string) => {
    loadRequest.current?.abort();
    const request = new AbortController();
    loadRequest.current = request;
    setLoading(true);
    setError("");
    try {
      const page = await opsApi.stacks(after, request.signal);
      if (request.signal.aborted) return;
      setRows((existing) => {
        const combined = new Map(existing.map((stack) => [stack.id, stack]));
        for (const stack of page) combined.set(stack.id, stack);
        return [...combined.values()];
      });
      setCursor(page.length === 100 ? page.at(-1)?.id : undefined);
    } catch (failure) {
      if (!request.signal.aborted) setError(message(failure));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => loadRequest.current?.abort();
  }, [load]);
  const create = form.handleSubmit(async (input) => {
    setError("");
    try {
      const row = await opsApi.create(input);
      setRows((current) => current.some(({ id }) => id === row.id) ? current : [...current, row]);
      select(row.id);
      form.reset({ node_id: input.node_id, stack_name: "" });
    } catch (failure) { setError(message(failure)); }
  });
  const active = rows.find((row) => row.id === selected);
  return <div className="space-y-4">
    <AgentStatus telemetry onComposeNode={(id) => {
      form.setValue("node_id", id, { shouldValidate: true });
      form.setFocus("stack_name");
    }} />
    <Card>
      <CardHeader><CardTitle>Stack Docker Compose</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]" noValidate onSubmit={create}>
          <FormField label="UUID node" error={form.formState.errors.node_id?.message}>
            <Input {...form.register("node_id")} />
          </FormField>
          <FormField label="Nama stack" error={form.formState.errors.stack_name?.message}>
            <Input maxLength={63} {...form.register("stack_name")} />
          </FormField>
          <Button type="submit" className="sm:mt-6" disabled={form.formState.isSubmitting}>Daftarkan stack</Button>
        </form>
        <Feedback error={error} />
        {loading && <p role="status" className="text-sm text-muted">Memuat stack…</p>}
        {!loading && !rows.length && !error && <p className="text-sm text-muted">Belum ada stack di area ini.</p>}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => <li key={row.id} className="min-w-0">
            <Button type="button" variant={row.id === selected ? "secondary" : "outline"} aria-pressed={row.id === selected}
              className="h-auto w-full items-start justify-between gap-2 whitespace-normal py-2 text-left"
              onClick={() => select(row.id)}>
              <span className="min-w-0 wrap-anywhere">{row.stack_name}</span>
              <span className="shrink-0 text-xs text-muted">{labels[row.status]}</span>
            </Button>
          </li>)}
        </ul>
        {cursor && <Button type="button" variant="outline" disabled={loading} onClick={() => void load(cursor)}>Muat lagi</Button>}
      </CardContent>
    </Card>
    {active && <StackEditor key={active.id} stack={active} onResult={(updated) =>
      setRows((current) => current.map((row) => row.id === updated.id ? updated : row))
    } />}
  </div>;
}

function StackEditor({ stack, onResult }: { stack: Stack; onResult: (stack: Stack) => void }) {
  const [busy, setBusy] = useState(false);
  const [hasYaml, setHasYaml] = useState(stack.status === "NEW");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [output, setOutput] = useState("");
  const [command, setCommand] = useState("");
  const request = useRef<AbortController>(null);
  const form = useForm<z.infer<typeof composeFormSchema>>({
    resolver: zodResolver(composeFormSchema),
    mode: "onBlur",
    defaultValues: { compose: stack.status === "NEW" ? sample : "", replaceEnv: false, env: "" },
  });
  const compose = form.watch("compose");
  const replaceEnv = form.watch("replaceEnv");
  const yamlMessage = form.formState.errors.compose?.message;
  useEffect(() => () => request.current?.abort(), []);

  async function run(input: StackAction) {
    if (request.current) return;
    const current = new AbortController();
    request.current = current;
    setBusy(true);
    setError("");
    setNotice("Menunggu agent…");
    setOutput("");
    const loadsYaml = input.action === "read" || input.action === "convert";
    let collected = "";
    try {
      const job = await opsApi.action(stack.id, input, current.signal);
      const status = await streamOps(`stacks/${stack.id}/logs/${job.job_id}`, job, current.signal, (text) => {
        if (loadsYaml) collected += text;
        else setOutput((previous) => previous + text);
      });
      if (current.signal.aborted) return;
      if (status === "succeeded" && loadsYaml) {
        form.setValue("compose", collected, { shouldValidate: true, shouldDirty: input.action === "convert" });
        setHasYaml(true);
        if (input.action === "convert") setCommand("");
      }
      if (status === "succeeded" && input.action === "save") {
        form.reset({ compose: input.input.compose, replaceEnv: false, env: "" });
      }
      if (status !== "succeeded" && loadsYaml) setOutput(collected);
      setNotice(opsStatus(status));
      if (!loadsYaml) {
        const latest = await opsApi.stack(stack.id, current.signal);
        if (!current.signal.aborted) onResult(latest);
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setNotice("");
        setError(message(failure));
      }
    } finally {
      if (!current.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  function indent(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "]" || !event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    const editor = event.currentTarget;
    const { selectionStart, selectionEnd } = editor;
    form.setValue("compose", compose.slice(0, selectionStart) + "  " + compose.slice(selectionEnd), { shouldDirty: true });
    requestAnimationFrame(() => editor.setSelectionRange(selectionStart + 2, selectionStart + 2));
  }

  return <Card>
    <CardHeader><CardTitle className="wrap-anywhere">{stack.stack_name}</CardTitle>
      <p className="wrap-anywhere text-xs text-muted">{stack.compose_path} · {stack.node_id}</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run({ action: "read", input: {} })}>Buka file host</Button>
        {([
          ["up", "Jalankan"], ["down", "Hentikan"], ["pull", "Tarik image"], ["restart", "Mulai ulang"],
        ] as const).map(([action, label]) => <Button key={action} type="button" variant="outline" disabled={busy}
          onClick={() => void run({ action, input: {} })}>{label}</Button>)}
      </div>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => {
        event.preventDefault();
        const parsed = runCommandSchema.safeParse(command);
        if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
        void run({ action: "convert", input: { command: parsed.data } });
      }}>
        <label className="block min-w-0 grow space-y-1.5 text-sm font-medium">
          <span>Konversi docker run</span>
          <Input placeholder="docker run -d -p 8080:80 nginx:alpine" value={command} maxLength={4096}
            onChange={(event) => setCommand(event.target.value)} disabled={busy} />
        </label>
        <Button type="submit" variant="outline" disabled={busy || !command.trim()}>Konversi ke YAML</Button>
      </form>
      <form className="space-y-3" noValidate onSubmit={form.handleSubmit(({ compose, env, replaceEnv }) =>
        run({ action: "save", input: { compose, ...(replaceEnv ? { env } : {}) } }),
      )}>
        <FormField label="compose.yaml" error={yamlMessage}>
          <textarea className="block min-h-56 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed"
            rows={12} spellCheck={false} autoCapitalize="off" autoComplete="off" wrap="off" maxLength={65_536}
            disabled={busy} {...form.register("compose", { onChange: () => setHasYaml(true) })} onKeyDown={indent}
            aria-describedby="compose-keyboard" />
        </FormField>
        <p id="compose-keyboard" className="text-xs text-muted">Ctrl+] pada editor menyisipkan dua spasi.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={busy} {...form.register("replaceEnv")} /> Ganti .env di host
        </label>
        {replaceEnv && <FormField label=".env (NAME=value)" error={form.formState.errors.env?.message}>
          <textarea className="block w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-sm"
            rows={5} spellCheck={false} autoCapitalize="off" autoComplete="off" maxLength={16_384} disabled={busy}
            {...form.register("env")} placeholder="Kosongkan untuk menghapus isi .env" />
        </FormField>}
        <Button type="submit" disabled={busy || !hasYaml}>Simpan file</Button>
      </form>
      <Feedback error={error} notice={notice} />
      <OpsOutput label={`Log stack ${stack.stack_name}`} text={output} />
    </CardContent>
  </Card>;
}
