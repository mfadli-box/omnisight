function getCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem("OmniSightCompany")?.trim();
  return id || null;
}

function clearServerSession() {
  try {
    void fetch("/proxy/guest/PUB00", { method: "DELETE", credentials: "same-origin" });
  } catch {
    /* ignore */
  }
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

  let url = `/proxy/pages${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-ID"] = companyId;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);
  const requestId = res.headers.get("X-Request-ID") || "";

  if (!res.ok) {
    if (res.status === 401) {
      clearServerSession();
      window.location.href = "/login";
      throw new ClientApiError("Session expired", 401, "UNAUTHORIZED", requestId);
    }
    const message = data?.error || data?.message || `Request failed (${res.status})`;
    throw new ClientApiError(message, res.status, data?.code, requestId);
  }

  return data as T;
}
