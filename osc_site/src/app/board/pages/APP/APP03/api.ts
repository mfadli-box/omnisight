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

export interface APP03User {
  id: string;
  username: string;
  email: string;
  fullname: string;
  phone?: string | null;
  company_id: string;
  company_name?: string;
  employee_id?: string | null;
  location_id?: string | null;
  department_id?: string | null;
  division_id?: string | null;
  role: string;
  job: string;
  key: string;
  is_admin: boolean;
  is_hris: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCompanyRow {
  id: string;
  user_id: string;
  company_id: string;
  company_code?: string;
  company_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface UserPrivilegeRow {
  id: string;
  user_company_id: string;
  module_id: string;
  module_code?: string;
  module_name?: string;
  level: string;
  created_at: string;
}

export interface UserAreaRow {
  id: string;
  user_id: string;
  company_area_id: string;
  area_code?: string;
  area_name?: string;
  company_name?: string;
  is_active: boolean;
  created_at: string;
}

export function fetchUsers(p: GridParams): Promise<GridResult<APP03User>> {
  return gridFetch<APP03User>("/APP03/users", p);
}

export function fetchUser(id: string): Promise<APP03User> {
  return getOne<APP03User>(`/APP03/users/${id}`);
}

export function createUser(body: Partial<Record<keyof APP03User, unknown>>) {
  return createItem<APP03User>("/APP03/users", body);
}

export function updateUser(id: string, body: Partial<Record<keyof APP03User, unknown>>) {
  return updateItem<APP03User>(`/APP03/users/${id}`, body);
}

export function deleteUser(id: string) {
  return removeItem(`/APP03/users/${id}`);
}

export function fetchUserCompanies(userId: string): Promise<GridResult<UserCompanyRow>> {
  return listFetch<UserCompanyRow>(`/APP03/users/${userId}/companies`);
}

export function assignUserCompany(userId: string, body: { company_id: string; is_active: boolean }) {
  return createItem<UserCompanyRow>(`/APP03/users/${userId}/companies`, body);
}

export function updateUserCompany(userId: string, uid: string, body: { is_active?: boolean }) {
  return updateItem<UserCompanyRow>(`/APP03/users/${userId}/companies/${uid}`, body);
}

export function removeUserCompany(userId: string, uid: string) {
  return removeItem(`/APP03/users/${userId}/companies/${uid}`);
}

export function fetchUserPrivileges(userId: string, userCompanyId: string): Promise<GridResult<UserPrivilegeRow>> {
  return listFetch<UserPrivilegeRow>(`/APP03/users/${userId}/companies/${userCompanyId}/privileges`);
}

export function createUserPrivilege(
  userId: string,
  userCompanyId: string,
  body: { module_id: string; level: string },
) {
  return createItem<UserPrivilegeRow>(`/APP03/users/${userId}/companies/${userCompanyId}/privileges`, body);
}

export function updateUserPrivilege(
  userId: string,
  userCompanyId: string,
  pid: string,
  body: { level?: string },
) {
  return updateItem<UserPrivilegeRow>(`/APP03/users/${userId}/companies/${userCompanyId}/privileges/${pid}`, body);
}

export function removeUserPrivilege(userId: string, userCompanyId: string, pid: string) {
  return removeItem(`/APP03/users/${userId}/companies/${userCompanyId}/privileges/${pid}`);
}

export function fetchUserAreas(userId: string): Promise<GridResult<UserAreaRow>> {
  return listFetch<UserAreaRow>(`/APP03/users/${userId}/areas`);
}

export function assignUserArea(userId: string, body: { company_area_id: string; is_active: boolean }) {
  return createItem<UserAreaRow>(`/APP03/users/${userId}/areas`, body);
}

export function updateUserArea(userId: string, uid: string, body: { is_active?: boolean }) {
  return updateItem<UserAreaRow>(`/APP03/users/${userId}/areas/${uid}`, body);
}

export function removeUserArea(userId: string, uid: string) {
  return removeItem(`/APP03/users/${userId}/areas/${uid}`);
}

export async function fetchCompanyOptions() {
  const res = await clientApi<{ data: { Rows: Array<{ id: string; code: string; name: string }> } }>(
    "/APP02/companies",
    { params: { page: "1", page_size: "500", sort: "code", order: "asc" } },
  );
  return (res.data?.Rows ?? []).map((c) => ({
    id: c.id,
    name: `${c.code} - ${c.name}`,
  }));
}

export async function fetchModuleOptions() {
  const res = await clientApi<{ data: { Rows: Array<{ id: string; code: string; name: string; parent_id?: string | null }> } }>(
    "/APP01/modules",
    { params: { page: "1", page_size: "500", sort: "code", order: "asc" } },
  );
  return (res.data?.Rows ?? [])
    .filter((m) => Boolean(m.parent_id))
    .map((m) => ({
      id: m.id,
      name: `${m.code} - ${m.name}`,
    }));
}

export async function fetchAreaOptions(companyId: string) {
  const res = await clientApi<{ data: Array<{ id: string; code: string; name: string }> }>(
    `/APP02/companies/${companyId}/areas`,
  );
  return (res.data ?? []).map((a) => ({
    id: a.id,
    name: `${a.code} - ${a.name}`,
  }));
}