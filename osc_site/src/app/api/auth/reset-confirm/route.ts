import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, clearAuthCookies, jsonError } from "@/lib/server/backend";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return jsonError(400, "INVALID_REQUEST", "Format permintaan tidak valid."); }
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (token.length < 16 || token.length > 512) return jsonError(400, "INVALID_RESET_TOKEN", "Tautan pemulihan tidak valid.");
  try {
    const upstream = await backendRequest("auth/mfa/reset-confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    if (!upstream.ok) {
      const error = await backendError(upstream);
      return NextResponse.json({ error: { code: error.code, message: "Tautan pemulihan tidak valid atau sudah kedaluwarsa." } }, { status: error.status });
    }
    const response = NextResponse.json({ data: { reset: true } });
    clearAuthCookies(response);
    return response;
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan pemulihan sedang tidak tersedia.");
  }
}
