import {
  gridFetch,
  type GridParams,
  type GridResult,
} from "@/lib/grid";

export interface SYS03HistoryRow {
  id: string;
  token_type: string;
  ip_address?: string | null;
  user_agent?: string | null;
  issued_at: string;
  access_expires_at: string;
  is_blocked: boolean;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  created_at: string;
}

export function fetchHistory(p: GridParams): Promise<GridResult<SYS03HistoryRow>> {
  return gridFetch<SYS03HistoryRow>("/SYS03/history", p);
}
