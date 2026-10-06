import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { BE_POOL } from "@/lib/backend";
import { storageKey } from "@/lib/utility";

async function getSession() {
  const jar = await cookies();
  const raw = jar.get(storageKey)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

async function proxyRequest(
  method: string,
  apiPath: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
  isFormData = false,
) {
  const session = await getSession();
  if (!session?.token) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", error: "Unauthorized", request_id: "" },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.token}`,
    ...extraHeaders,
  };
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${BE_POOL}/rest/pages${apiPath}`, {
      method,
      headers,
      body: isFormData
        ? (body as FormData)
        : body
          ? JSON.stringify(body)
          : undefined,
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backend service unreachable";
    console.error(`[PROXY:PAGES] ${method} ${apiPath} — backend unreachable:`, message);
    return NextResponse.json(
      { code: "EXTERNAL_SERVICE_ERROR", error: message, request_id: "" },
      { status: 502 },
    );
  }

  const requestId = res.headers.get("X-Request-ID") ?? "";
  const data = await res.json().catch(() => null);

  if (res.status >= 400) {
    const errorBody = data ? JSON.stringify(data) : "(empty)";
    console.error(`[PROXY:PAGES] ${method} ${apiPath} → ${res.status}`, errorBody);
  }

  const body_ = data && data.code
    ? { code: data.code, error: data.error ?? "", request_id: requestId || (data.request_id ?? "") }
    : data;

  return NextResponse.json(body_, {
    status: res.status,
    headers: { "X-Request-ID": requestId },
  });
}

function extractExtraHeaders(req: Request): Record<string, string> {
  const extra: Record<string, string> = {};
  const companyId = req.headers.get("X-Company-ID");
  if (companyId) extra["X-Company-ID"] = companyId;
  return extra;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  const url = new URL(_req.url);
  const qs = url.searchParams.toString();
  return proxyRequest("GET", qs ? `${apiPath}?${qs}` : apiPath, undefined, extractExtraHeaders(_req));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    return proxyRequest("POST", apiPath, formData, extractExtraHeaders(req), true);
  }
  const body = await req.json().catch(() => null);
  return proxyRequest("POST", apiPath, body, extractExtraHeaders(req));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  const body = await req.json().catch(() => null);
  return proxyRequest("PUT", apiPath, body, extractExtraHeaders(req));
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  return proxyRequest("DELETE", apiPath, undefined, extractExtraHeaders(req));
}
