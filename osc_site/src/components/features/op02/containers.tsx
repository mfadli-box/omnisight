"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { containerApi } from "@/services/containers";
import { message } from "@/services/api";
import { useWorkspaceStore } from "@/stores/workspace";
import type { Container, Sbom } from "@/validations/container.schema";
import { Feedback } from "../shared/form-feedback";

type Location = Pick<Container, "company_id" | "area_id" | "store_id">;
function TableView<T>({ rows, columns, title }: { rows: T[]; columns: ColumnDef<T>[]; title: string }) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  return <div tabIndex={0} role="region" aria-label={title} className="overflow-x-auto rounded-lg border border-border outline-primary"><Table>
    <TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id} aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : undefined}>{header.column.getCanSort() ? <button type="button" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())} ↕</button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
    <tbody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</tbody></Table></div>;
}
export function Containers() {
  const [rows, setRows] = useState<Container[]>([]); const [sbom, setSbom] = useState<Sbom[]>([]);
  const [company, setCompany] = useState(""); const [area, setArea] = useState(""); const [store, setStore] = useState("");
  const [loading, setLoading] = useState(true); const [sbomLoading, setSbomLoading] = useState(true);
  const [listError, setListError] = useState(""); const [sbomError, setSbomError] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState<Container>(); const [reload, setReload] = useState(0);
  const contextCompany = useWorkspaceStore((s) => s.activeCompany); const contextArea = useWorkspaceStore((s) => s.activeArea);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setSbom([]); setLoading(true); setSbomLoading(true); setListError(""); setSbomError("");
    containerApi.list(controller.signal)
      .then((containers) => { if (!controller.signal.aborted) setRows(containers); })
      .catch((failure) => { if (!controller.signal.aborted) setListError(message(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    containerApi.sbom(controller.signal)
      .then((inventory) => { if (!controller.signal.aborted) setSbom(inventory); })
      .catch((failure) => { if (!controller.signal.aborted) setSbomError(message(failure)); })
      .finally(() => { if (!controller.signal.aborted) setSbomLoading(false); });
    return () => controller.abort();
  }, [contextCompany, contextArea, reload]);
  useEffect(() => { setCompany(""); setArea(""); setStore(""); }, [contextCompany, contextArea]);
  const locations: Location[] = [...rows, ...sbom];
  function options(key: keyof Location, source: Location[], label: string) {
    return [{ value: "", label: `Semua ${label}` }, ...Array.from(new Set(source.map((r) => r[key]))).sort().map((id) => ({ value: id, label: id }))];
  }
  const inLocation = (r: Location) => (!company || r.company_id === company) && (!area || r.area_id === area) && (!store || r.store_id === store);
  const filtered = rows.filter(inLocation); const selectedSbom = sbom.filter(inLocation);
  const packages = selectedSbom.flatMap((item) => item.packages.map((pkg) => ({ ...pkg, image: item.image, container_id: item.container_id, node_id: item.node_id })));
  const run = useCallback(async (row: Container, action: "start" | "stop" | "prune") => {
    setBusy(true); setError(""); setNotice(""); setConfirm(undefined);
    try { const job = await containerApi.action(row.id, { node_id: row.node_id, action }); setNotice(`Aksi dikirim ke agent (job ${job.job_id}). Perbarui inventaris setelah job selesai.`); }
    catch (failure) { setError(message(failure)); } finally { setBusy(false); }
  }, []);
  const columns = useMemo<ColumnDef<Container>[]>(() => [
    { accessorKey: "name", header: "Kontainer", cell: ({ row }) => <div><div className="font-medium">{row.original.name}</div><div className="text-xs text-muted">{row.original.id.slice(0, 12)} · {row.original.node_id}</div></div> },
    { accessorKey: "image", header: "Image" }, { accessorKey: "state", header: "Status" },
    { accessorKey: "recorded_at", header: "Inventaris (UTC)" },
    { accessorKey: "image_update_status", header: "Update image", cell: ({ getValue }) => ({ unknown: "Belum diketahui", available: "Update tersedia", current: "Terbaru" } as Record<string, string>)[getValue<string>()] ?? getValue<string>() },
    { id: "actions", header: "Aksi", enableSorting: false, cell: ({ row }) => <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy || row.original.state.toLowerCase() === "running"} onClick={() => void run(row.original, "start")}>Mulai</Button>
      <Button size="sm" variant="outline" disabled={busy || row.original.state.toLowerCase() !== "running"} onClick={() => void run(row.original, "stop")}>Hentikan</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm(row.original)}>Prune</Button></div> },
  ], [busy, run]);
  const packageColumns = useMemo<ColumnDef<(typeof packages)[number]>[]>(() => [
    { accessorKey: "name", header: "Paket" }, { accessorKey: "version", header: "Versi" }, { accessorKey: "type", header: "Jenis" },
    { accessorKey: "image", header: "Image" }, { accessorKey: "container_id", header: "Kontainer" }, { accessorKey: "node_id", header: "Node" },
  ], []);
  return <Card><CardHeader><CardTitle>Manajemen kontainer</CardTitle><p className="text-sm text-muted">Inventaris dan paket dari agent pada konteks yang diizinkan.</p></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <Select label="Filter company" value={company} options={options("company_id", locations, "company")} onChange={(value) => { setCompany(value); setArea(""); setStore(""); }} />
      <Select label="Filter area" value={area} options={options("area_id", locations.filter((r) => !company || r.company_id === company), "area")} onChange={(value) => { setArea(value); setStore(""); }} />
      <Select label="Filter store" value={store} options={options("store_id", locations.filter((r) => (!company || r.company_id === company) && (!area || r.area_id === area)), "store")} onChange={setStore} />
    </div>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={loading || sbomLoading} onClick={() => setReload((n) => n + 1)}>Perbarui inventaris</Button>{loading && <span role="status" className="text-sm text-muted">Memuat inventaris…</span>}</div>
    <Feedback error={error} notice={notice} />
    {confirm && <div role="alert" className="rounded-lg border border-border p-3 text-sm"><p>Prune akan menghapus semua kontainer yang telah berhenti pada node {confirm.node_id}. Lanjutkan?</p><div className="mt-2 flex gap-2"><Button size="sm" disabled={busy} onClick={() => void run(confirm, "prune")}>Ya, prune</Button><Button size="sm" variant="outline" onClick={() => setConfirm(undefined)}>Batal</Button></div></div>}
    <Tabs defaultValue="containers"><TabsList><TabsTrigger value="containers">Kontainer ({filtered.length})</TabsTrigger><TabsTrigger value="sbom">SBOM ({packages.length})</TabsTrigger></TabsList>
      <TabsPanel value="containers" className="space-y-3 pt-4"><Feedback error={listError} />{filtered.length ? <TableView rows={filtered} columns={columns} title="Kontainer" /> : !loading && !listError && <p className="text-sm text-muted">Tidak ada kontainer untuk filter ini.</p>}</TabsPanel>
      <TabsPanel value="sbom" className="space-y-3 pt-4"><Feedback error={sbomError} />{sbomLoading && <p role="status" className="text-sm text-muted">Memuat SBOM…</p>}{selectedSbom.filter((item) => item.status !== "available").map((item) => <p key={`${item.node_id}:${item.container_id}`} className="text-sm text-muted">{({ unsupported: "SBOM tidak didukung", unavailable: "SBOM tidak tersedia", too_large: "SBOM terlalu besar untuk dikumpulkan" } as Record<string, string>)[item.status]} untuk {item.image} ({item.container_id.slice(0, 12)}).</p>)}{packages.length ? <TableView rows={packages} columns={packageColumns} title="Paket SBOM" /> : !sbomLoading && !sbomError && <p className="text-sm text-muted">Tidak ada paket SBOM untuk filter ini.</p>}</TabsPanel>
    </Tabs></CardContent></Card>;
}
