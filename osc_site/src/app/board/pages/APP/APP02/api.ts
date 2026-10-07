import { clientApi } from "@/lib/client-api";
import {
  gridFetch,
  listFetch,
  createItem,
  updateItem,
  removeItem,
  getOne,
  type GridParams,
  type GridResult,
} from "@/lib/grid";

export interface APP02Company {
  id: string;
  code: string;
  name: string;
  valuta: string;
  vat_id?: string | null;
  reg_no?: string | null;
  address?: string | null;
  tax_office?: string | null;
  hris_link?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyModuleRow {
  id: string;
  company_id: string;
  module_id: string;
  module_name?: string;
  module_code?: string;
  is_active: boolean;
  created_at: string;
}

export interface CompanyAreaRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export function fetchCompanies(p: GridParams): Promise<GridResult<APP02Company>> {
  return gridFetch<APP02Company>("/APP02/companies", p);
}

export function fetchCompany(id: string): Promise<APP02Company> {
  return getOne<APP02Company>(`/APP02/companies/${id}`);
}

export function createCompany(body: Partial<Record<keyof APP02Company, unknown>>) {
  return createItem<APP02Company>("/APP02/companies", body);
}

export function updateCompany(id: string, body: Partial<Record<keyof APP02Company, unknown>>) {
  return updateItem<APP02Company>(`/APP02/companies/${id}`, body);
}

export function deleteCompany(id: string) {
  return removeItem(`/APP02/companies/${id}`);
}

export function fetchCompanyModules(companyId: string): Promise<GridResult<CompanyModuleRow>> {
  return listFetch<CompanyModuleRow>(`/APP02/companies/${companyId}/modules`);
}

export function assignCompanyModule(companyId: string, body: { module_id: string; is_active: boolean }) {
  return createItem<CompanyModuleRow>(`/APP02/companies/${companyId}/modules`, body);
}

export function updateCompanyModule(companyId: string, uid: string, body: { is_active?: boolean }) {
  return updateItem<CompanyModuleRow>(`/APP02/companies/${companyId}/modules/${uid}`, body);
}

export function removeCompanyModule(companyId: string, uid: string) {
  return removeItem(`/APP02/companies/${companyId}/modules/${uid}`);
}

export function fetchCompanyAreas(companyId: string): Promise<GridResult<CompanyAreaRow>> {
  return listFetch<CompanyAreaRow>(`/APP02/companies/${companyId}/areas`);
}

export function createCompanyArea(companyId: string, body: Partial<Record<keyof CompanyAreaRow, unknown>>) {
  return createItem<CompanyAreaRow>(`/APP02/companies/${companyId}/areas`, body);
}

export function updateCompanyArea(companyId: string, uid: string, body: Partial<Record<keyof CompanyAreaRow, unknown>>) {
  return updateItem<CompanyAreaRow>(`/APP02/companies/${companyId}/areas/${uid}`, body);
}

export function deleteCompanyArea(companyId: string, uid: string) {
  return removeItem(`/APP02/companies/${companyId}/areas/${uid}`);
}

export async function fetchModuleOptions() {
  const res = await clientApi<{ data: { Rows: Array<{ id: string; code: string; name: string }> } }>(
    "/APP01/modules",
    { params: { page: "1", page_size: "500", sort: "code", order: "asc" } },
  );
  return (res.data?.Rows ?? []).map((m) => ({
    id: m.id,
    name: `${m.code} - ${m.name}`,
  }));
}
