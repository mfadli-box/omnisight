import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readJson, setMfaCookie, setSessionCookie, tooLarge } from "@/lib/server/backend";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  if (tooLarge(request, 8_192)) return jsonError(413, "REQUEST_TOO_LARGE", "Permintaan terlalu besar.");
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return jsonError(400, "INVALID_REQUEST", "Format permintaan tidak valid."); }
  const username = typeof input.username === "string" ? input.username.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const companyId = input.company_id === null || input.company_id === "" ? null : input.company_id;
  const backupCode = typeof input.backup_code === "string" ? input.backup_code.trim() : undefined;
  if (!username || username.length > 128 || !password || password.length > 1024 || (companyId !== null && (typeof companyId !== "string" || !UUID.test(companyId))) || (backupCode && backupCode.length > 128)) {
    return jsonError(400, "INVALID_REQUEST", "Periksa kembali informasi login.");
  }
  try {
    const upstream = await backendRequest("auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company_id: companyId, username, password, ...(backupCode ? { backup_code: backupCode } : {}) }),
    });
    const payload = await readJson(upstream);
    if (!upstream.ok) {
      const error = await backendError(new Response(JSON.stringify(payload), { status: upstream.status }));
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    const data = (payload.data || {}) as Record<string, unknown>;
    const response = NextResponse.json({
      data: {
        mfa_required: data.mfa_required === true,
        user: data.user || null,
      },
    });
    if (data.mfa_required === true) {
      if (typeof data.mfa_challenge_token !== "string") return jsonError(502, "AUTH_UPSTREAM_INVALID", "Tantangan autentikasi tidak lengkap.");
      setMfaCookie(response, data.mfa_challenge_token);
    } else if (typeof data.access_token === "string") {
      setSessionCookie(response, data.access_token, typeof data.expires_in === "number" ? data.expires_in : 900);
    } else {
      return jsonError(502, "AUTH_UPSTREAM_INVALID", "Layanan autentikasi memberikan respons yang tidak lengkap.");
    }
    return response;
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi sedang tidak tersedia.");
  }
}
