import { clientApi } from "@/lib/client-api";
import {
  gridFetch,
  createItem,
  updateItem,
  removeItem,
  getOne,
  type GridParams,
  type GridResult,
} from "@/lib/grid";

export interface UserSession {
  id: string;
  user_id: string;
  username?: string;
  fullname?: string;
  session_token: string;
  ip_address?: string | null;
  user_agent?: string | null;
  started_at: string;
  last_active: string;
  ended_at?: string | null;
  status: string;
  policy_id?: string | null;
}

export interface UserToken {
  id: string;
  user_id: string;
  username?: string;
  fullname?: string;
  token_type: string;
  token: string;
  refresh_token?: string | null;
  fingerprint?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  device_id?: string | null;
  issued_at: string;
  access_expires_at: string;
  refresh_expires_at?: string | null;
  last_activity_at?: string | null;
  is_blocked: boolean;
  blocked_reason?: string | null;
  impersonated_by?: string | null;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  created_at: string;
}

export function fetchSessions(p: GridParams): Promise<GridResult<UserSession>> {
  return gridFetch<UserSession>("/APP05/sessions", p);
}

export function fetchSession(id: string): Promise<UserSession> {
  return getOne<UserSession>(`/APP05/sessions/${id}`);
}

export function createSession(body: {
  user_id: string;
  session_token: string;
  ip_address?: string;
  user_agent?: string;
  status: string;
  policy_id?: string;
}) {
  return createItem<UserSession>("/APP05/sessions", body);
}

export function updateSession(id: string, body: Partial<Record<keyof UserSession, unknown>>) {
  return updateItem<UserSession>(`/APP05/sessions/${id}`, body);
}

export function deleteSession(id: string) {
  return removeItem(`/APP05/sessions/${id}`);
}

export function fetchTokens(p: GridParams): Promise<GridResult<UserToken>> {
  return gridFetch<UserToken>("/APP05/tokens", p);
}

export function fetchToken(id: string): Promise<UserToken> {
  return getOne<UserToken>(`/APP05/tokens/${id}`);
}

export function createToken(body: {
  user_id: string;
  token_type: string;
  token: string;
  refresh_token?: string;
  fingerprint?: string;
  ip_address?: string;
  user_agent?: string;
  device_id?: string;
  access_expires_at: string;
  refresh_expires_at?: string;
  is_blocked: boolean;
  blocked_reason?: string;
}) {
  return createItem<UserToken>("/APP05/tokens", body);
}

export function updateToken(id: string, body: Partial<Record<keyof UserToken, unknown>> & { revoke?: boolean }) {
  return updateItem<UserToken>(`/APP05/tokens/${id}`, body);
}

export function deleteToken(id: string) {
  return removeItem(`/APP05/tokens/${id}`);
}

export async function fetchUserOptions() {
  const res = await clientApi<{ data: { Rows: Array<{ id: string; username: string; fullname: string; is_active: boolean }> } }>(
    "/APP03/users",
    { params: { page: "1", page_size: "500", sort: "username", order: "asc" } },
  );
  return (res.data?.Rows ?? []).map((u) => ({
    id: u.id,
    name: `${u.username} - ${u.fullname || ""}`.trim(),
  }));
}