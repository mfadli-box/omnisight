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

export interface SignatureType {
  id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalStep {
  id: string;
  type_id: string;
  signature_type_code?: string;
  signature_type_name?: string;
  step: number;
  condition: string;
}

export interface ApprovalSign {
  id: string;
  step_id: string;
  user_id: string;
  username?: string;
  fullname?: string;
}

export interface SignatureForm {
  id: string;
  signature_type_id?: string | null;
  signature_type_code?: string;
  signature_type_name?: string;
  step: number;
  request_id: string;
  condition: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SignatureFlag {
  id: string;
  form_id: string;
  user_id: string;
  username?: string;
  fullname?: string;
  status: string;
  comment?: string | null;
  created_at: string;
  updated_at: string;
}

export function fetchSignatureTypes(p: GridParams): Promise<GridResult<SignatureType>> {
  return gridFetch<SignatureType>("/APP04/types", p);
}

export function fetchSignatureType(id: string): Promise<SignatureType> {
  return getOne<SignatureType>(`/APP04/types/${id}`);
}

export function createSignatureType(body: { code: string; name: string }) {
  return createItem<SignatureType>("/APP04/types", body);
}

export function updateSignatureType(id: string, body: Partial<Record<keyof SignatureType, unknown>>) {
  return updateItem<SignatureType>(`/APP04/types/${id}`, body);
}

export function deleteSignatureType(id: string) {
  return removeItem(`/APP04/types/${id}`);
}

export function fetchApprovalSteps(typeId: string): Promise<GridResult<ApprovalStep>> {
  return listFetch<ApprovalStep>(`/APP04/types/${typeId}/steps`);
}

export function createApprovalStep(typeId: string, body: { step: number; condition: string }) {
  return createItem<ApprovalStep>(`/APP04/types/${typeId}/steps`, body);
}

export function updateApprovalStep(typeId: string, sid: string, body: { step?: number; condition?: string }) {
  return updateItem<ApprovalStep>(`/APP04/types/${typeId}/steps/${sid}`, body);
}

export function deleteApprovalStep(typeId: string, sid: string) {
  return removeItem(`/APP04/types/${typeId}/steps/${sid}`);
}

export function fetchApprovalSigns(typeId: string, stepId: string): Promise<GridResult<ApprovalSign>> {
  return listFetch<ApprovalSign>(`/APP04/types/${typeId}/steps/${stepId}/signers`);
}

export function createApprovalSign(typeId: string, stepId: string, body: { user_id: string }) {
  return createItem<ApprovalSign>(`/APP04/types/${typeId}/steps/${stepId}/signers`, body);
}

export function updateApprovalSign(typeId: string, stepId: string, uid: string, body: { user_id: string }) {
  return updateItem<ApprovalSign>(`/APP04/types/${typeId}/steps/${stepId}/signers/${uid}`, body);
}

export function deleteApprovalSign(typeId: string, stepId: string, uid: string) {
  return removeItem(`/APP04/types/${typeId}/steps/${stepId}/signers/${uid}`);
}

export function fetchSignatureForms(p: GridParams): Promise<GridResult<SignatureForm>> {
  return gridFetch<SignatureForm>("/APP04/forms", p);
}

export function fetchSignatureForm(id: string): Promise<SignatureForm> {
  return getOne<SignatureForm>(`/APP04/forms/${id}`);
}

export function createSignatureForm(body: {
  signature_type_id?: string;
  step: number;
  request_id: string;
  condition: string;
  status: string;
}) {
  return createItem<SignatureForm>("/APP04/forms", body);
}

export function updateSignatureForm(id: string, body: Partial<Record<keyof SignatureForm, unknown>>) {
  return updateItem<SignatureForm>(`/APP04/forms/${id}`, body);
}

export function deleteSignatureForm(id: string) {
  return removeItem(`/APP04/forms/${id}`);
}

export function fetchSignatureFlags(formId: string): Promise<GridResult<SignatureFlag>> {
  return listFetch<SignatureFlag>(`/APP04/forms/${formId}/flags`);
}

export function createSignatureFlag(formId: string, body: { user_id: string; status: string; comment?: string }) {
  return createItem<SignatureFlag>(`/APP04/forms/${formId}/flags`, body);
}

export function updateSignatureFlag(formId: string, uid: string, body: { status?: string; comment?: string }) {
  return updateItem<SignatureFlag>(`/APP04/forms/${formId}/flags/${uid}`, body);
}

export function deleteSignatureFlag(formId: string, uid: string) {
  return removeItem(`/APP04/forms/${formId}/flags/${uid}`);
}

export async function fetchTypeOptions() {
  const res = await clientApi<{ data: { Rows: Array<{ id: string; code: string; name: string }> } }>(
    "/APP04/types",
    { params: { page: "1", page_size: "500", sort: "code", order: "asc" } },
  );
  return (res.data?.Rows ?? []).map((t) => ({
    id: t.id,
    name: `${t.code} - ${t.name}`,
  }));
}

export async function fetchUserOptions() {
  const res = await clientApi<{ data: { Rows: Array<{ id: string; username: string; fullname: string; is_active: boolean }> } }>(
    "/APP03/users",
    { params: { page: "1", page_size: "500", sort: "username", order: "asc" } },
  );
  return (res.data?.Rows ?? [])
    .filter((u) => u.is_active)
    .map((u) => ({
      id: u.id,
      name: `${u.username} - ${u.fullname || ""}`.trim(),
    }));
}