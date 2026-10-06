import { NextResponse } from "next/server";
import { BE_POOL } from "@/lib/backend";

async function proxyRequest(
  method: string,
  apiPath: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let res: Response;
  try {
    res = await fetch(`${BE_POOL}/rest/guest${apiPath}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backend service unreachable";
    console.error(`[PROXY:GUEST] ${method} ${apiPath} — backend unreachable:`, message);
    return NextResponse.json(
      { code: "EXTERNAL_SERVICE_ERROR", error: message, request_id: "" },
      { status: 502 },
    );
  }

  const requestId = res.headers.get("X-Request-ID") ?? "";
  const data = await res.json().catch(() => null);

  if (res.status >= 400) {
    const errorBody = data ? JSON.stringify(data) : "(empty)";
    console.error(`[PROXY:GUEST] ${method} ${apiPath} → ${res.status}`, errorBody);
  }

  const body_ = data && data.code
    ? { code: data.code, error: data.error ?? "", request_id: requestId || (data.request_id ?? "") }
    : data;

  return NextResponse.json(body_, {
    status: res.status,
    headers: { "X-Request-ID": requestId },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  const url = new URL(_req.url);
  const qs = url.searchParams.toString();
  return proxyRequest("GET", qs ? `${apiPath}?${qs}` : apiPath);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  const body = await req.json().catch(() => null);
  return proxyRequest("POST", apiPath, body);
}
