import { NextResponse } from "next/server";
import { z } from "zod";
import { backendError, backendRequest, jsonError, readJson, sessionToken, tokenHeaders } from "@/services/backend";
import { contextSchema, navigationItemSchema } from "@/validations/tenant.schema";

const items = z.array(navigationItemSchema);

export async function GET() {
  const token = await sessionToken();
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  try {
    const upstream = await backendRequest("me/navigation", { headers: tokenHeaders(token) });
    if (!upstream.ok) {
      const error = await backendError(upstream);
      return jsonError(error.status, error.code, error.message);
    }
    const data = items.safeParse((await readJson(upstream)).data);
    if (!data.success) return jsonError(502, "BACKEND_RESPONSE_INVALID", "Respons navigasi tidak valid.");

    // REST has authenticated the token. Claims read here supply display context only.
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const context = contextSchema.safeParse({
      company_id: claims.active_company_id ?? claims.company_id ?? null,
      area_id: claims.area_id ?? null,
      area_ids: claims.active_area_ids ?? claims.allowed_area_ids ?? [],
    });
    if (!context.success) return jsonError(502, "BACKEND_RESPONSE_INVALID", "Konteks navigasi tidak valid.");
    return NextResponse.json({ data: data.data, context: context.data }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError(503, "BACKEND_UNAVAILABLE", "Data navigasi belum tersedia.");
  }
}
