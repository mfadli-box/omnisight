import { loginRequestSchema, upstreamLoginSchema } from "@/validations/auth.schema";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readAuthInput, readJson, setMfaCookie, setSessionCookie, tooLarge } from "@/services/backend";


export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  if (tooLarge(request, 8_192)) return jsonError(413, "REQUEST_TOO_LARGE", "Permintaan terlalu besar.");
  const input = loginRequestSchema.safeParse(await readAuthInput(request).catch(() => null));
  if (!input.success) return jsonError(400, "INVALID_REQUEST", "Periksa kembali informasi login.");
  try {
    const upstream = await backendRequest("auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.data),
    });
    if (upstream.status >= 300 && upstream.status < 400) return jsonError(502, "AUTH_UPSTREAM_INVALID", "Respons autentikasi tidak valid.");
    if (!upstream.ok) {
      const error = await backendError(upstream);
      return jsonError(error.status, error.code, error.message);
    }
    const result = upstreamLoginSchema.safeParse((await readJson(upstream)).data);
    if (!result.success) return jsonError(502, "AUTH_UPSTREAM_INVALID", "Respons autentikasi tidak lengkap.");
    const data = result.data;
    const response = NextResponse.json({ data: { mfa_required: data.mfa_required, user: data.user } },
      { headers: { "cache-control": "no-store" } });
    if (data.mfa_required) setMfaCookie(response, data.mfa_challenge_token);
    else setSessionCookie(response, data.access_token, data.expires_in);
    return response;
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi sedang tidak tersedia.");
  }
}
