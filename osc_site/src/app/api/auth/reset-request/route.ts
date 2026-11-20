import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readAuthInput } from "@/lib/server/backend";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const input = await readAuthInput(request).catch(() => null);
  if (!input) return jsonError(400, "INVALID_REQUEST", "Format permintaan tidak valid.");
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (email.length < 5 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError(400, "INVALID_EMAIL", "Masukkan alamat email yang valid.");
  try {
    const upstream = await backendRequest("auth/mfa/reset-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    if (!upstream.ok) {
      const error = await backendError(upstream);
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ data: { accepted: true } }, { status: 202 });
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Layanan pemulihan sedang tidak tersedia.");
  }
}
