import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, readJson, tokenHeaders } from "@/lib/server/backend";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const token = (await cookies()).get("omnisight_session")?.value;
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  let input: Record<string, unknown>; try { input = await request.json(); } catch { return jsonError(400, "INVALID_REQUEST", "Format permintaan tidak valid."); }
  const target_id = input.target_id; const reason = typeof input.reason === "string" ? input.reason.trim() : ""; const otp = typeof input.otp === "string" ? input.otp : undefined;
  if (typeof target_id !== "string" || !UUID.test(target_id) || reason.length < 3 || reason.length > 1000 || (otp && !/^\d{6}$/.test(otp))) return jsonError(400, "INVALID_REQUEST", "Periksa target, alasan, dan kode OTP.");
  try {
    const upstream = await backendRequest("pam/sessions/authorize", { method: "POST", headers: { ...tokenHeaders(token), "content-type": "application/json" }, body: JSON.stringify({ target_id, reason, ...(otp ? { otp } : {}) }) });
    const payload = await readJson(upstream);
    if (!upstream.ok) { const error = await backendError(new Response(JSON.stringify(payload), { status: upstream.status })); return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status }); }
    return NextResponse.json(payload, { status: upstream.status });
  } catch { return jsonError(503, "BACKEND_UNAVAILABLE", "Layanan PAM sedang tidak tersedia."); }
}
