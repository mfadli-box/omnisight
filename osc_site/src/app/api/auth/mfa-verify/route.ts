import { loginUserSchema, otpFormSchema, sessionSchema } from "@/validations/auth.schema";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readAuthInput, mfaCookieName, readJson, setSessionCookie } from "@/services/backend";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const challenge = (await cookies()).get(mfaCookieName())?.value;
  if (!challenge) return jsonError(401, "MFA_CHALLENGE_EXPIRED", "Tantangan MFA sudah berakhir. Silakan login lagi.");
  const input = otpFormSchema.safeParse(await readAuthInput(request).catch(() => null));
  if (!input.success) return jsonError(400, "INVALID_OTP_FORMAT", "Masukkan kode OTP 6 digit.");
  try {
    const upstream = await backendRequest("auth/mfa/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfa_challenge_token: challenge, otp: input.data.otp }) });
    if (upstream.status >= 300 && upstream.status < 400) return jsonError(502, "AUTH_UPSTREAM_INVALID", "Respons autentikasi tidak valid.");
    if (!upstream.ok) {
      const error = await backendError(upstream);
      return jsonError(error.status, error.code, error.message);
    }
    const result = sessionSchema.extend({ user: loginUserSchema }).safeParse((await readJson(upstream)).data);
    if (!result.success) return jsonError(502, "AUTH_UPSTREAM_INVALID", "Verifikasi MFA belum menghasilkan sesi.");
    const data = result.data;
    const response = NextResponse.json({ data: { authenticated: true, user: data.user } },
      { headers: { "cache-control": "no-store" } });
    setSessionCookie(response, data.access_token, data.expires_in);
    return response;
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi sedang tidak tersedia.");
  }
}
