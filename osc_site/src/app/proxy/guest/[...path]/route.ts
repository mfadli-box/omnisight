import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { BE_POOL } from "@/lib/backend";
import { sessionCookie } from "@/lib/utility";

const SESSION_MAX_AGE = 60 * 60 * 24;

type BackendSession = {
  token?: string;
  expires_at?: string;
  user_profile?: unknown;
};

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

  // Pada login sukses, ekstrak token untuk disimpan di cookie HttpOnly dan
  // hapus dari body agar tidak pernah terekspos ke JavaScript klien.
  const session = (data as { data?: BackendSession } | null)?.data;
  let sessionToken: string | undefined;
  if (res.ok && session?.token) {
    sessionToken = session.token;
    delete session.token;
  }

  const body_ = data && data.code
    ? { code: data.code, error: data.error ?? "", request_id: requestId || (data.request_id ?? "") }
    : data;

  const response = NextResponse.json(body_, {
    status: res.status,
    headers: { "X-Request-ID": requestId },
  });

  if (sessionToken) {
    response.cookies.set({
      name: sessionCookie,
      value: JSON.stringify({ token: sessionToken, expires_at: session?.expires_at ?? "" }),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  }

  return response;
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  // Logout: revoke token di backend (server-side) lalu hapus cookie HttpOnly.
  if (apiPath === "/PUB00") {
    const jar = await cookies();
    const raw = jar.get(sessionCookie)?.value;
    if (raw) {
      try {
        const s = JSON.parse(decodeURIComponent(raw)) as { token?: string };
        if (s?.token) {
          await fetch(`${BE_POOL}/rest/pages/APP00`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${s.token}` },
            cache: "no-store",
          }).catch(() => undefined);
        }
      } catch {
        /* cookie rusak — tetap hapus */
      }
    }
    const response = NextResponse.json({ data: { message: "logged out" } }, { status: 200 });
    response.cookies.set({
      name: sessionCookie,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }
  return proxyRequest("DELETE", apiPath);
}
