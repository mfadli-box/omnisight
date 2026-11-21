"use client";

import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DataRow } from "@/validations/resource.schema";

export function DataTable({ title, rows, columns }: { title: string; rows: DataRow[]; columns: ColumnDef<DataRow>[] }) {
  const table = useReactTable({
    data: rows, columns, getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  return <div tabIndex={0} role="region" aria-label={title} className="overflow-x-auto rounded-lg border border-border outline-primary">
    <Table>
      <TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>
        {group.headers.map((header) => {
          const order = header.column.getIsSorted();
          const SortIcon = order === "asc" ? ArrowUp : order === "desc" ? ArrowDown : ArrowUpDown;
          const content = flexRender(header.column.columnDef.header, header.getContext());
          return <TableHead key={header.id} aria-sort={order === "asc" ? "ascending" : order === "desc" ? "descending" : undefined}>
            {header.column.getCanSort() ? <button type="button" onClick={header.column.getToggleSortingHandler()}
              className="inline-flex items-center gap-2 rounded outline-primary hover:text-foreground">
              {content}<SortIcon className="size-3" aria-hidden="true" />
            </button> : content}
          </TableHead>;
        })}
      </TableRow>)}</TableHeader>
      <tbody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>
        {row.getVisibleCells().map((cell) => <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>)}
      </TableRow>)}</tbody>
    </Table>
  </div>;
}
