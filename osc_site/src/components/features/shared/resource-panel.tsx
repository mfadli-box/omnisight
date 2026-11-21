"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiData, jsonRequest, message } from "@/services/api";
import { rowListSchema, rowSchema, type DataRow } from "@/validations/resource.schema";
import { DataTable } from "./data-table";
import { Feedback } from "./form-feedback";
import { ResourceForm, type Field, type ResourcePath } from "./resource-form";

export type { Field } from "./resource-form";
const pageSize = 25;

function display(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return "—";
}

type Props = {
  title: string;
  columns: Field[];
  rowAction?: (row: DataRow) => ReactNode;
  filter?: (row: DataRow) => boolean;
  emptyMessage?: string;
  summarize?: (rows: DataRow[]) => ReactNode;
} & (
  | { path: string; readOnly: true; fields?: never; createOnly?: never; archiveLabel?: never }
  | { path: ResourcePath; readOnly?: false; fields: Field[]; createOnly?: boolean; archiveLabel?: string }
);

export function ResourcePanel(props: Props) {
  const { title, path, columns, readOnly, createOnly, archiveLabel, rowAction, filter, emptyMessage, summarize } = props;
  const [rows, setRows] = useState<DataRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<DataRow | "new" | null>(null);
  const [confirm, setConfirm] = useState<DataRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiData(`${path}?limit=${pageSize}&offset=${offset}`, rowListSchema, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setRows(data); })
      .catch((failure) => { if (!controller.signal.aborted) setListError(message(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, offset, reload]);

  function refresh(nextOffset = offset) {
    setLoading(true);
    setListError("");
    setOffset(nextOffset);
    setReload((count) => count + 1);
  }

  async function mutate(action: "save" | "delete", payload?: object) {
    const row = action === "delete" ? confirm : editing;
    const id = row && row !== "new" ? row.id : undefined;
    setBusy(true);
    setError("");
    try {
      await apiData(id ? `${path}/${id}` : path, rowSchema, action === "delete" ? { method: "DELETE" }
        : jsonRequest(id ? "PATCH" : "POST", payload || {}));
      toast.success(action === "delete" ? "Perubahan diterapkan." : "Data disimpan.");
      setEditing(null);
      setConfirm(null);
      refresh(action === "delete" && rows.length === 1 ? Math.max(0, offset - pageSize) : offset);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  const visible = filter ? rows.filter(filter) : rows;
  const tableColumns: ColumnDef<DataRow>[] = columns.map(({ key, label }) => ({
    id: key, accessorFn: (row) => row[key], header: label,
    cell: ({ getValue }) => {
      const value = display(getValue());
      return key === "status" || key === "approval_status" || key === "outcome" ? <Badge>{value}</Badge> : value;
    },
  }));
  if (rowAction || archiveLabel || (!readOnly && !createOnly)) tableColumns.push({
    id: "actions", header: "Aksi", enableSorting: false,
    cell: ({ row }) => <div className="flex flex-wrap items-center gap-2">
      {rowAction?.(row.original)}
      {!readOnly && !createOnly && <Button variant="outline" size="sm" disabled={busy} onClick={() => {
        setEditing(row.original); setConfirm(null); setError("");
      }}>Ubah</Button>}
      {archiveLabel && <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
        setConfirm(row.original); setEditing(null); setError("");
      }}>{archiveLabel}</Button>}
    </div>,
  });

  return <div className="space-y-4">
    {!loading && !listError && summarize?.(rows)}
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading || busy}>Muat ulang</Button>
          {!readOnly && <Button size="sm" disabled={busy} onClick={() => {
            setEditing("new"); setConfirm(null); setError("");
          }}>Tambah</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Feedback error={error} />
        {editing && !props.readOnly && <ResourceForm key={editing === "new" ? "new" : editing.id}
          path={props.path} fields={props.fields} editing={editing} busy={busy} save={(data) => mutate("save", data)}
          cancel={() => { setEditing(null); setError(""); }} />}
        {confirm && <div className="space-y-3 rounded-lg border border-danger/25 p-4">
          <p className="text-sm">{archiveLabel} {display(confirm[columns[0].key])}?</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={busy} onClick={() => void mutate("delete")}>{busy ? "Memproses…" : archiveLabel}</Button>
            <Button variant="outline" disabled={busy} onClick={() => { setConfirm(null); setError(""); }}>Batal</Button>
          </div>
        </div>}
        {loading ? <p role="status" className="text-sm text-muted">Memuat data…</p>
          : listError ? <Feedback error={listError} />
          : visible.length === 0 ? <p className="text-sm text-muted">{emptyMessage || "Belum ada data pada halaman ini."}</p>
          : <DataTable title={title} rows={visible} columns={tableColumns} />}
        {(offset > 0 || rows.length === pageSize) && <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={loading || busy || offset === 0} onClick={() => refresh(offset - pageSize)}>Sebelumnya</Button>
          <span className="text-sm text-muted">Halaman {offset / pageSize + 1}</span>
          <Button variant="outline" size="sm" disabled={loading || busy || rows.length < pageSize} onClick={() => refresh(offset + pageSize)}>Berikutnya</Button>
        </div>}
      </CardContent>
    </Card>
  </div>;
}
