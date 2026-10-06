import { clientApi } from "./client-api";

export interface GridParams {
  search: string;
  page: number;
  size: number;
  sort_by: string;
  sort_order: "asc" | "desc";
}

export interface GridResult<T> {
  data: T[];
  meta: { total: number; page: number; size: number };
}

export interface PagePayload<T> {
  Rows?: T[];
  Total?: number;
  Page?: number;
  PageSize?: number;
  TotalPage?: number;
}

export function buildParams(p: GridParams): Record<string, string> {
  const params: Record<string, string> = {
    search: p.search,
    page: String(p.page),
    page_size: String(p.size),
  };
  if (p.sort_by) {
    params.sort = p.sort_by;
    params.order = p.sort_order;
  }
  return params;
}

export function toGridResult<T>(payload: PagePayload<T>, p: GridParams): GridResult<T> {
  return {
    data: payload.Rows ?? [],
    meta: {
      total: payload.Total ?? 0,
      page: payload.Page ?? p.page,
      size: payload.PageSize ?? p.size,
    },
  };
}

export async function gridFetch<T>(path: string, p: GridParams): Promise<GridResult<T>> {
  const res = await clientApi<{ data: PagePayload<T> }>(path, { params: buildParams(p) });
  return toGridResult(res.data, p);
}

export async function listFetch<T>(path: string): Promise<GridResult<T>> {
  const res = await clientApi<{ data: T[] }>(path);
  const rows = res.data ?? [];
  return {
    data: rows,
    meta: { total: rows.length, page: 1, size: rows.length },
  };
}

export async function getOne<T>(path: string): Promise<T> {
  const res = await clientApi<{ data: T }>(path);
  return res.data;
}

export async function createItem<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await clientApi<{ data: T }>(path, { method: "POST", body });
  return res.data;
}

export async function updateItem<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await clientApi<{ data: T }>(path, { method: "PUT", body });
  return res.data;
}

export async function removeItem(path: string): Promise<void> {
  await clientApi<{ message?: string }>(path, { method: "DELETE" });
}
