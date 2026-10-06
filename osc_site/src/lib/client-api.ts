import { parseSession, storageKey } from "@/lib/utility";

function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${storageKey}=`));
  if (!raw) return null;
  try {
    const session = parseSession(
      decodeURIComponent(raw.split("=").slice(1).join("=")),
    );
    return session?.token ?? null;
  } catch {
    return null;
  }
}

function getCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem("OmniSightCompany")?.trim();
  return id || null;
}

export class ClientApiError extends Error {
  status: number;
  code: string;
  requestId: string;
  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code || "UNKNOWN_ERROR";
    this.requestId = requestId || "";
  }
}

export async function clientApi<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<T> {
  const { method = "GET", body, params } = options;
  const token = getToken();

  let url = `/proxy/pages${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-ID"] = companyId;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);
  const requestId = res.headers.get("X-Request-ID") || "";

  if (!res.ok) {
    if (res.status === 401) {
      document.cookie = `${storageKey}=; path=/; max-age=0`;
      window.location.href = "/login";
      throw new ClientApiError("Session expired", 401, "UNAUTHORIZED", requestId);
    }
    const message = data?.error || data?.message || `Request failed (${res.status})`;
    throw new ClientApiError(message, res.status, data?.code, requestId);
  }

  return data as T;
}
