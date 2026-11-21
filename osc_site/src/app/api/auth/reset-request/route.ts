import { resetRequestSchema } from "@/validations/auth.schema";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readAuthInput } from "@/services/backend";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const input = resetRequestSchema.safeParse(await readAuthInput(request).catch(() => null));
  if (!input.success) return jsonError(400, "INVALID_EMAIL", "Masukkan alamat email yang valid.");
  try {
    const upstream = await backendRequest("auth/mfa/reset-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input.data) });
    if (!upstream.ok) {
      const error = await backendError(upstream);
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ data: { accepted: true } }, { status: 202 });
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan pemulihan sedang tidak tersedia.");
  }
}
