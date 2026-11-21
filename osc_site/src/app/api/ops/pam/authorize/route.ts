import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readAuthInput, readJson, sessionToken, tokenHeaders } from "@/services/backend";
import { pamRequestSchema, pamSessionSchema } from "@/validations/pam.schema";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const token = await sessionToken();
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  const input = pamRequestSchema.safeParse(await readAuthInput(request).catch(() => null));
  if (!input.success) return jsonError(400, "INVALID_REQUEST", "Periksa target, alasan, dan kode OTP.");
  try {
    const upstream = await backendRequest("pam/sessions/authorize", {
      method: "POST", headers: { ...tokenHeaders(token), "content-type": "application/json" },
      body: JSON.stringify(input.data),
    });
    if (!upstream.ok) {
      const error = await backendError(upstream);
      return jsonError(error.status, error.code, error.message);
    }
    const payload = await readJson(upstream);
    if (!pamSessionSchema.safeParse(payload.data).success) {
      return jsonError(502, "BACKEND_RESPONSE_INVALID", "Respons PAM tidak valid.");
    }
    return NextResponse.json(payload, { status: upstream.status, headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError(503, "BACKEND_UNAVAILABLE", "Layanan PAM sedang tidak tersedia.");
  }
}
