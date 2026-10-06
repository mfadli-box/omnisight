import React, { useState, useEffect, useRef, } from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from './pagination';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './table';
import { FileText, Pencil, Plus, Search, Settings, Trash2 } from 'lucide-react';
import { Button } from './button';
import { Label } from './label';
import { Switch } from './switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './select';
import { useIsMobile } from '@/lib/view-mobile';
import { ClientApiError } from '@/lib/client-api';
import DataTableCard from './datatable-card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogTitle, AlertDialogTrigger,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader
} from './alert-dialog';

type KeyColumn<T> = {
  [K in keyof T]: {
    header: string;
    accessor: K;
    selected?: (value: boolean, row: T) => React.ReactNode;
    sortable?: boolean;
    hidden?: boolean;
    align?: 'left' | 'center' | 'right';
    formatter?: (value: T[K], row: T) => React.ReactNode;
  }
}[keyof T];

type ComputedColumn<T> = {
  header: string;
  accessor: (row: T) => React.ReactNode;
  selected?: (value: boolean, row: T) => React.ReactNode;
  sortable?: boolean;
  hidden?: boolean;
  align?: 'left' | 'center' | 'right';
  formatter?: never;
};

export type Column<T> = KeyColumn<T> | ComputedColumn<T>;
export interface ActionConfig<T> {
  onSearch?: () => void;
  onSelect?: (row: T) => void;
  onDetail?: (row: T) => void;
  onCreate?: () => void;
  onUpdate?: (row: T) => void;
  onDelete?: (row: T) => void;
  pickSelect?: boolean;
  hideDetail?: boolean;
  hideCreate?: boolean;
  hideUpdate?: boolean;
  hideDelete?: boolean;
}

interface DataTableProps<T> {
  fetchData: (params: {
    search: string;
    page: number;
    size: number;
    sort_by: string;
    sort_order: 'asc' | 'desc';
  }) => Promise<{ data: T[]; meta: { total: number; page: number; size: number } }>;
  columns: Column<T>[];
  actions?: ActionConfig<T>;
  hideSearch?: boolean;
  hideSelect?: boolean;
  hidePaging?: boolean;
  hideSort?: boolean;
  hideColumnToggle?: boolean;
  refreshTrigger?: boolean;
  debounceDelay?: number;
  mobileCardView?: boolean;
  selectAction?: (selectedRows: T[], clearSelection: () => void) => React.ReactNode;
}

function TableSkeleton({
  columnCount, rowCount = 5,
}: {
  columnCount: number;
  rowCount?: number,
}) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, rIdx) => (
        <TableRow key={rIdx} className="border-b border-gray-100">
          {Array.from({ length: columnCount }).map((_, cIdx) => (
            <TableCell key={cIdx} className="px-2 py-1">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-full"></div>
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
export default function DataTable<T extends { id: string | number }>({
  fetchData,
  columns,
  actions,
  hideSearch = false,
  hideSelect = false,
  hidePaging = false,
  hideSort = false,
  hideColumnToggle = false,
  refreshTrigger = false,
  debounceDelay = 500,
  mobileCardView = true,
  selectAction,
}: DataTableProps<T>) {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [selectedIx, setselectedIx] = useState<string[]>([]);
  const isMobile = useIsMobile();
  const showMobileCards = mobileCardView && isMobile;
  const selectableItems = data.filter(
    (row) => {
      const maybeSelectable = row as T & { selected?: boolean };
      return maybeSelectable.selected !== false;
    }
  );
  const isAllSelected = selectableItems.length > 0 && selectableItems.every(
    (row) => selectedIx.includes(row.id.toString())
  );
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchTerm);
      setPage(1);
    }, debounceDelay);
    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, debounceDelay]);
  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);
  useEffect(() => {
    const controller = new AbortController();
    const loadData = async () => {
      setLoading(true);
      try {
        const result = await fetchDataRef.current({
           search, page, size, sort_by: sortBy, sort_order: sortOrder
        });
        if (!controller.signal.aborted) {
          setData(result.data);
          setTotal(result.meta.total);
          setselectedIx([]);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error instanceof ClientApiError && error.status === 401) return;
          console.error("Failed to fetch data:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    loadData();
    return () => controller.abort();
  }, [search, page, size, sortBy, sortOrder, refreshTrigger]);
  const handleSort = (field: string) => {
    if (hideSort) return;
    const isAsc = sortBy === field && sortOrder === 'asc';
    setSortBy(field);
    setSortOrder(isAsc ? 'desc' : 'asc');
  };
  const handleSelectAll = () => {
    if (isAllSelected) {
      setselectedIx([]);
    } else {
      setselectedIx(selectableItems.map((row) => row.id.toString()));
    }
  };
  const handleSelectRow = (id: string) => {
    setselectedIx((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    if (!actions?.pickSelect && actions?.onSelect) {
      const selectedRow = data.find((row) => row.id.toString() === id);
      if (selectedRow) {
        actions.onSelect(selectedRow);
      }
    }
  };
  const getSelectedRows = (): typeof data => {
    return data.filter((item) => selectedIx.includes(item.id.toString()));
  };
  const clearSelection = () => setselectedIx([]);
  const getAlignClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'center') return 'text-center justify-center';
    if (align === 'right') return 'text-right justify-end';
    return 'text-left justify-start';
  };
  const filteredColumns = columns.filter((col) => {
    if (col.header in columnVisibility) {
      return columnVisibility[col.header] !== false;
    }
    return !col.hidden;
  });
  const hasActions = actions && (!actions.hideDetail || !actions.hideUpdate || !actions.hideDelete);
  const totalTableColumns = filteredColumns.length + (hasActions ? 1 : 0);
  const totalPages = Math.ceil(total / size);
  const selectedRows = getSelectedRows();

  return (
    <div className="flex flex-col gap-4 min-w-0 mb-1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <InputGroup className="px-1 py-5">
          {!hideSearch ? (
            <>
              <InputGroupButton variant="outline" size="sm"
                onClick={actions?.onSearch} >
                <Search />
              </InputGroupButton>
              <InputGroupInput
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {!hidePaging && (
                <InputGroupAddon>
                  <Select
                    value={String(size)}
                    onValueChange={(value: string | null) => {
                      const nextSize = Number(value ?? "");
                      if (Number.isNaN(nextSize)) { return; }
                      setPage(1);
                      setSize(nextSize);
                    }}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </InputGroupAddon>
              )}
            </>
          ) : <div />}
          {!hideColumnToggle && (
            <InputGroupAddon align="inline-end">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="sm"
                    />
                  }
                >
                  <Settings />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--anchor-width) min-w-100 rounded-lg"
                  align="end"
                  sideOffset={4}
                >
                  <div className="max-h-100 overflow-y-auto">
                    <p className="text-sm px-2 py-1">Visible Columns:</p>
                    {columns.map((col, idx) => (
                      <Label className="text-sm p-1" key={idx} >
                        <Switch
                          checked={
                            col.header in columnVisibility
                              ? columnVisibility[col.header] !== false
                              : !col.hidden
                          }
                          onCheckedChange={() =>
                            setColumnVisibility((prev) => {
                              const current =
                                col.header in prev ? prev[col.header] !== false : !col.hidden;
                              return {
                                ...prev,
                                [col.header]: !current,
                              };
                            })
                          }
                        />
                        {col.header}
                      </Label>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </InputGroupAddon>
          )}
          {actions?.onCreate && !actions.hideCreate && (
            <InputGroupButton variant="outline" size="sm" className="mr-1"
              onClick={actions.onCreate} >
              <Plus />
            </InputGroupButton>
          )}
        </InputGroup>
      </div>
      {showMobileCards ? (
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="border border-gray-200 rounded-lg bg-white p-3 shadow-sm animate-pulse">
                  <div className="h-4 w-24 rounded bg-gray-200 mb-3" />
                  <div className="h-3 w-full rounded bg-gray-100 mb-2" />
                  <div className="h-3 w-4/5 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-muted-foreground">
              No data found.
            </div>
          ) : (
            data.map((row) => (
              <DataTableCard
                key={row.id}
                row={row}
                columns={filteredColumns}
                onEdit={actions?.onUpdate ? (value) => actions.onUpdate?.(value) : undefined}
                onDelete={actions?.onDelete ? (value) => actions.onDelete?.(value) : undefined}
                onDetail={actions?.onDetail ? (value) => actions.onDetail?.(value) : undefined}
                hideDetail={actions?.hideDetail}
                hideEdit={actions?.hideUpdate}
                hideDelete={actions?.hideDelete}
              />
            ))
          )}
        </div>
      ) : (
        <div className="w-full overflow-auto border border-gray-200 rounded-sm touch-manipulation">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow>
                {!hideSelect && (
                  <TableHead className="px-2 py-1">
                    {actions?.pickSelect && (
                      <Switch
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                        disabled={selectableItems.length === 0}
                      />
                    )}
                  </TableHead>
                )}
                {filteredColumns.map((col, idx) => (
                  <TableHead
                    key={idx}
                    onClick={() => {
                      if (!col.sortable || typeof col.accessor === 'function') {
                        return;
                      }
                      handleSort(String(col.accessor));
                    }}
                    className={`px-2 py-1 ${getAlignClass(col.align)} ${col.sortable && !hideSort
                      ? 'cursor-pointer select-none hover:bg-gray-200' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      <span className="text-xs text-muted-foreground">
                        {col.sortable && !hideSort && typeof col.accessor !== 'function' ? (sortBy === String(col.accessor) ? (
                          sortOrder === 'asc' ? '▲' : '▼'
                        ) : ' ↕') : ''}
                      </span>
                    </div>
                  </TableHead>
                ))}
                {actions && (!actions.hideDetail || !actions.hideUpdate || !actions.hideDelete) && (
                  <TableHead className="px-2 py-1 text-right">
                    {(actions?.pickSelect && !actions?.onSelect && selectedRows.length > 0) &&
                      selectAction && selectAction(selectedRows, clearSelection)
                    }
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton columnCount={totalTableColumns} rowCount={5} />
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="px-2 py-1 text-center text-muted-foreground">
                    No data found.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.id} className="border-b hover:bg-gray-50">
                    {!hideSelect && (
                      <TableCell className="px-2 py-1">
                        <Switch
                          checked={selectedIx.includes(row.id.toString())}
                          onCheckedChange={() => handleSelectRow(row.id.toString())}
                        />
                      </TableCell>
                    )}
                    {filteredColumns.map((col, idx) => {
                      return (
                        <TableCell key={idx}
                          className={`px-2 py-1 text-gray-900 sm:whitespace-nowrap ${getAlignClass(col.align)}`}
                        >
                          {typeof col.accessor === 'function'
                            ? col.accessor(row)
                            : col.formatter
                              ? col.formatter(row[col.accessor], row)
                              : (row[col.accessor] as React.ReactNode)
                          }
                        </TableCell>
                      );
                    })}
                    {actions && (!actions.hideDetail || !actions.hideUpdate || !actions.hideDelete) && (
                      <TableCell className="px-2 py-1 text-right">
                        {actions.onDetail && !actions.hideDetail && (
                          <Button variant="outline" size="sm" className={"ml-1 touch-manipulation h-9 w-9"} onClick={
                            () => actions.onDetail?.(row)
                          } ><FileText /></Button>
                        )}
                        {actions.onUpdate && !actions.hideUpdate && (
                          <Button variant="outline" size="sm" className={"ml-1 touch-manipulation h-9 w-9"} onClick={
                            () => actions.onUpdate?.(row)
                          } ><Pencil /></Button>
                        )}
                        {actions.onDelete && !actions.hideDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger render={<Button variant="outline" size="sm" className={"ml-1 touch-manipulation h-9 w-9"} />}>
                              <Trash2 />
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Record?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone for record {row.id}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={
                                  () => actions.onDelete?.(row)
                                }>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-col text-sm">
          {!hideSelect && (
            <> / {selectedRows.length} selected</>
          )}
        </p>
        <div className="flex items-center gap-2">
          {!hidePaging && totalPages > 0 && (
            <>
              <span className="text-sm text-muted-nowrap">Page</span>
              <Select
                value={String(page)}
                onValueChange={(value: string | null) => {
                  const next = Number(value ?? "");
                  if (Number.isNaN(next) || next < 1 || next > totalPages) return;
                  setPage(next);
                }}
              >
                <SelectTrigger className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-nowrap">of {totalPages}</span>
              <Pagination className="mx-0 w-auto justify-end ml-auto">
                <PaginationContent className="touch-manipulation">
                  <PaginationItem>
                    <PaginationPrevious href="#"
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                      className={page <= 1 ? "pointer-events-none opacity-50"
                        : page === 1 || loading ? "pointer-events-none opacity-50" : "h-10 min-w-10"}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#"
                      onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                      className={page >= totalPages ? "pointer-events-none opacity-50"
                        : page === totalPages || loading ? "pointer-events-none opacity-50" : "h-10 min-w-10"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
