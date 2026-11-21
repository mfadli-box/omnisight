import { resetConfirmSchema } from "@/validations/auth.schema";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, clearAuthCookies, jsonError, readAuthInput } from "@/services/backend";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const input = resetConfirmSchema.safeParse(await readAuthInput(request).catch(() => null));
  if (!input.success) return jsonError(400, "INVALID_RESET_TOKEN", "Tautan pemulihan tidak valid.");
  try {
    const upstream = await backendRequest("auth/mfa/reset-confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input.data) });
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
