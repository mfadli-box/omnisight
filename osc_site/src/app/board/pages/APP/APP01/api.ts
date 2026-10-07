import {
  gridFetch,
  createItem,
  updateItem,
  removeItem,
  getOne,
  type GridParams,
  type GridResult,
} from "@/lib/grid";

export interface APP01Module {
  id: string;
  parent_id?: string | null;
  code: string;
  name: string;
  path: string;
  is_page: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function fetchModules(p: GridParams): Promise<GridResult<APP01Module>> {
  return gridFetch<APP01Module>("/APP01/modules", p);
}

export function fetchModule(id: string): Promise<APP01Module> {
  return getOne<APP01Module>(`/APP01/modules/${id}`);
}

export function createModule(body: Partial<Record<keyof APP01Module, unknown>>) {
  return createItem<APP01Module>("/APP01/modules", body);
}

export function updateModule(id: string, body: Partial<Record<keyof APP01Module, unknown>>) {
  return updateItem<APP01Module>(`/APP01/modules/${id}`, body);
}

export function deleteModule(id: string) {
  return removeItem(`/APP01/modules/${id}`);
}

export async function fetchModuleOptions() {
  const res = await gridFetch<APP01Module>("/APP01/modules", {
    search: "", page: 1, size: 500, sort_by: "code", sort_order: "asc",
  });
  return res.data.map((m) => ({ id: m.id, name: `${m.code} - ${m.name}`, parent_id: m.parent_id }));
}

export async function fetchRootModuleOptions() {
  const res = await gridFetch<APP01Module>("/APP01/modules", {
    search: "", page: 1, size: 500, sort_by: "code", sort_order: "asc",
  });
  return res.data
    .filter((m) => !m.parent_id)
    .map((m) => ({ id: m.id, name: `${m.code} - ${m.name}` }));
}
