import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendError, backendRequest, jsonError, readJson, tokenHeaders } from "@/lib/server/backend";

export async function GET() {
  const token = (await cookies()).get("omnisight_session")?.value;
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  try {
    const upstream = await backendRequest("me/navigation", { headers: tokenHeaders(token) });
    const payload = await readJson(upstream);
    if (!upstream.ok) {
      const error = await backendError(new Response(JSON.stringify(payload), { status: upstream.status }));
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    let context: Record<string, unknown> = {};
    try {
      const encoded = token.split(".")[1];
      const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
      context = {
        company_id: claims.active_company_id || claims.company_id || null,
        area_id: claims.area_id || null,
        area_ids: claims.active_area_ids || claims.allowed_area_ids || [],
      };
    } catch { /* Konteks hanya untuk tampilan; backend tetap memvalidasi sesi dan privilege. */ }
    return NextResponse.json({ ...payload, context }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError(503, "BACKEND_UNAVAILABLE", "Data navigasi belum tersedia.");
  }
}
