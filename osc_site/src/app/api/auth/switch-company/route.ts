import { z } from "zod";
import { sessionSchema } from "@/validations/auth.schema";
import { switchContextSchema, switchRequestSchema } from "@/validations/tenant.schema";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readAuthInput, readJson, setSessionCookie, sessionToken, tokenHeaders } from "@/services/backend";


export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const token = await sessionToken();
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  const input = switchRequestSchema.safeParse(await readAuthInput(request).catch(() => null));
  if (!input.success) return jsonError(400, "INVALID_CONTEXT", "Company atau regional tidak valid.");
  try {
    const upstream = await backendRequest("auth/switch-company", { method: "POST", headers: { ...tokenHeaders(token), "content-type": "application/json" }, body: JSON.stringify(input.data) });
    if (upstream.status >= 300 && upstream.status < 400) return jsonError(502, "AUTH_UPSTREAM_INVALID", "Respons autentikasi tidak valid.");
    if (!upstream.ok) {
      const error = await backendError(upstream);
      return jsonError(error.status, error.code, error.message);
    }
    const result = z.object({ ...switchContextSchema.shape, ...sessionSchema.shape }).safeParse((await readJson(upstream)).data);
    if (!result.success) return jsonError(502, "AUTH_UPSTREAM_INVALID", "Pergantian konteks belum menghasilkan sesi baru.");
    const { company_id, area_id, access_token, expires_in } = result.data;
    const response = NextResponse.json({ data: { company_id, area_id } }, { headers: { "cache-control": "no-store" } });
    setSessionCookie(response, access_token, expires_in);
    return response;
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi sedang tidak tersedia.");
  }
}
