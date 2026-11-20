"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiData, jsonRequest, message, type DataRow } from "@/lib/workspace/api";

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

export const selectClass = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm";
const pageSize = 25;

export function Feedback({ error, notice }: { error?: string; notice?: string }) {
  return <>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
  </>;
}

function display(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return "—";
}

export function ResourcePanel({ title, path, columns, fields, readOnly, createOnly, archiveLabel,
  rowAction, filter, emptyMessage }: {
  title: string;
  path: string;
  columns: Field[];
  fields?: Field[];
  readOnly?: boolean;
  createOnly?: boolean;
  archiveLabel?: string;
  rowAction?: (row: DataRow) => ReactNode;
  filter?: (row: DataRow) => boolean;
  emptyMessage?: string;
}) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<DataRow | "new" | null>(null);
  const [confirm, setConfirm] = useState<DataRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiData<DataRow[]>(`${path}?limit=${pageSize}&offset=${offset}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRows(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setListError(message(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, offset, reload]);

  function refresh(nextOffset = offset) {
    setLoading(true);
    setListError("");
    setOffset(nextOffset);
    setReload((count) => count + 1);
  }

  async function mutate(action: "save" | "delete", payload?: object) {
    setBusy(true);
    setError("");
    setNotice("");
    const id = action === "delete" ? confirm?.id : typeof editing === "object" ? editing?.id : undefined;
    try {
      await apiData(id ? `${path}/${id}` : path, action === "delete" ? { method: "DELETE" }
        : jsonRequest(id ? "PATCH" : "POST", payload || {}));
      setNotice(action === "delete" ? "Perubahan diterapkan." : "Data disimpan.");
      setEditing(null);
      setConfirm(null);
      refresh(action === "delete" && rows.length === 1 ? Math.max(0, offset - pageSize) : offset);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string | number | null> = {};
    for (const field of editableFields) {
      const raw = String(form.get(field.key) ?? "");
      const value = field.type === "textarea" || field.type === "password" ? raw : raw.trim();
      if (field.optional && !value && editing === "new") continue;
      if (!value && field.optional) {
        if (field.type === "email") payload[field.key] = null;
        else if (field.type === "textarea") payload[field.key] = "";
        continue;
      }
      payload[field.key] = field.type === "number" ? Number(value) : value;
    }
    void mutate("save", payload);
  }

  const visible = filter ? rows.filter(filter) : rows;
  const editableFields = (fields || []).filter((field) => editing === "new" || !field.createOnly);
  const actions = Boolean(rowAction || archiveLabel || (!readOnly && !createOnly));
  return <Card>
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
      <CardTitle>{title}</CardTitle>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading || busy}>Muat ulang</Button>
        {!readOnly && <Button size="sm" disabled={busy} onClick={() => {
          setEditing("new"); setConfirm(null); setError(""); setNotice("");
        }}>Tambah</Button>}
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <Feedback error={error} notice={notice} />
      {editing && <form onSubmit={save} key={editing === "new" ? "new" : editing.id} className="space-y-4 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold">{editing === "new" ? "Tambah data" : "Ubah data"}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {editableFields.map((field) => <FormField key={field.key} field={field} disabled={busy}
            value={editing === "new" ? undefined : editing[field.key]} />)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>Batal</Button>
        </div>
      </form>}
      {confirm && <div className="space-y-3 rounded-xl border border-rose-200 p-4">
        <p className="text-sm">{archiveLabel} {display(confirm[columns[0].key])}?</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void mutate("delete")}>{busy ? "Memproses…" : archiveLabel}</Button>
          <Button variant="outline" disabled={busy} onClick={() => { setConfirm(null); setError(""); }}>Batal</Button>
        </div>
      </div>}
      {loading ? <p role="status" className="text-sm text-slate-600">Memuat data…</p>
        : listError ? <Feedback error={listError} />
        : visible.length === 0 ? <p className="text-sm text-slate-600">{emptyMessage || "Belum ada data pada halaman ini."}</p>
        : <div tabIndex={0} role="region" aria-label={title} className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50"><tr>
              {columns.map((column) => <th className="px-3 py-2 font-semibold" scope="col" key={column.key}>{column.label}</th>)}
              {actions && <th className="px-3 py-2 font-semibold" scope="col">Aksi</th>}
            </tr></thead>
            <tbody>{visible.map((row, index) => <tr className="border-t border-slate-200" key={row.id || index}>
              {columns.map((column) => <td className="max-w-72 break-words px-3 py-2" key={column.key}>{display(row[column.key])}</td>)}
              {actions && <td className="p-2"><div className="flex flex-wrap items-center gap-2">
                {rowAction?.(row)}
                {!readOnly && !createOnly && <Button variant="outline" size="sm" disabled={busy} onClick={() => {
                  setEditing(row); setConfirm(null); setError(""); setNotice("");
                }}>Ubah</Button>}
                {archiveLabel && <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
                  setConfirm(row); setEditing(null); setError(""); setNotice("");
                }}>{archiveLabel}</Button>}
              </div></td>}
            </tr>)}</tbody>
          </table>
        </div>}
      {(offset > 0 || rows.length === pageSize) && <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" disabled={loading || busy || offset === 0} onClick={() => refresh(offset - pageSize)}>Sebelumnya</Button>
        <span className="text-sm text-slate-600">Halaman {offset / pageSize + 1}</span>
        <Button variant="outline" size="sm" disabled={loading || busy || rows.length < pageSize} onClick={() => refresh(offset + pageSize)}>Berikutnya</Button>
      </div>}
    </CardContent>
  </Card>;
}

function FormField({ field, value, disabled }: { field: Field; value: unknown; disabled: boolean }) {
  const initial = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const props = { name: field.key, required: !field.optional, disabled, defaultValue: initial };
  return <label className={`block space-y-1 text-sm ${field.type === "textarea" ? "md:col-span-2" : ""}`}>
    <span className="font-medium">{field.label}</span>
    {field.choices ? <select {...props} className={selectClass}>
      <option value="">Pilih nilai</option>
      {field.choices.map((choice) => <option key={choice}>{choice}</option>)}
    </select> : field.type === "textarea"
      ? <textarea {...props} rows={8} maxLength={262144} className="w-full rounded-xl border border-slate-300 p-3 font-mono" />
      : <Input {...props} type={field.type || "text"} min={field.min} max={field.type === "number" ? field.max : undefined}
        maxLength={field.type === "number" ? undefined : field.max || 255}
        minLength={field.type === "password" ? field.min : undefined} autoComplete={field.type === "password" ? "new-password" : undefined} />}
  </label>;
}
