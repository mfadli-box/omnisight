import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readJson, setSessionCookie, tokenHeaders } from "@/lib/server/backend";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const token = (await cookies()).get("omnisight_session")?.value;
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return jsonError(400, "INVALID_REQUEST", "Format permintaan tidak valid."); }
  const companyId = input.company_id;
  const areaId = input.area_id === null || input.area_id === "" ? null : input.area_id;
  if (typeof companyId !== "string" || !UUID.test(companyId) || (areaId !== null && (typeof areaId !== "string" || !UUID.test(areaId)))) return jsonError(400, "INVALID_CONTEXT", "Company atau regional tidak valid.");
  try {
    const upstream = await backendRequest("auth/switch-company", { method: "POST", headers: { ...tokenHeaders(token), "content-type": "application/json" }, body: JSON.stringify({ company_id: companyId, area_id: areaId }) });
    const payload = await readJson(upstream);
    if (!upstream.ok) {
      const error = await backendError(new Response(JSON.stringify(payload), { status: upstream.status }));
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    const data = (payload.data || {}) as Record<string, unknown>;
    if (typeof data.access_token !== "string") return jsonError(502, "AUTH_UPSTREAM_INVALID", "Pergantian konteks belum menghasilkan sesi baru.");
    const response = NextResponse.json({ data: { company_id: data.company_id, area_id: data.area_id } });
    setSessionCookie(response, data.access_token, typeof data.expires_in === "number" ? data.expires_in : 900);
    return response;
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi sedang tidak tersedia.");
  }
}
