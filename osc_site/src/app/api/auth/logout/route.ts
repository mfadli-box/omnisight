import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, clearAuthCookies, jsonError } from "@/lib/server/backend";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const response = NextResponse.json({ data: { logged_out: true } }, { headers: { "cache-control": "no-store" } });
  clearAuthCookies(response);
  return response;
}
