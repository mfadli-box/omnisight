import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readJson, setSessionCookie } from "@/lib/server/backend";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const challenge = (await cookies()).get("omnisight_mfa_pending")?.value;
  if (!challenge) return jsonError(401, "MFA_CHALLENGE_EXPIRED", "Tantangan MFA sudah berakhir. Silakan login lagi.");
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return jsonError(400, "INVALID_REQUEST", "Format permintaan tidak valid."); }
  const otp = typeof input.otp === "string" ? input.otp : "";
  if (!/^\d{6}$/.test(otp)) return jsonError(400, "INVALID_OTP_FORMAT", "Masukkan kode OTP 6 digit.");
  try {
    const upstream = await backendRequest("auth/mfa/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfa_challenge_token: challenge, otp }) });
    const payload = await readJson(upstream);
    if (!upstream.ok) {
      const error = await backendError(new Response(JSON.stringify(payload), { status: upstream.status }));
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    const data = (payload.data || {}) as Record<string, unknown>;
    if (typeof data.access_token !== "string") return jsonError(502, "AUTH_UPSTREAM_INVALID", "Verifikasi MFA belum menghasilkan sesi.");
    const response = NextResponse.json({ data: { authenticated: true, user: data.user || null } });
    setSessionCookie(response, data.access_token, typeof data.expires_in === "number" ? data.expires_in : 900);
    return response;
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi sedang tidak tersedia.");
  }
}
