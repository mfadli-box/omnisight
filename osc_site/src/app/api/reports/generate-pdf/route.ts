import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendRequest, jsonError, tokenHeaders } from "@/lib/server/backend";

const TABLES = new Set(["osc_sop_document", "osc_pam_session", "osc_agent_node", "osc_activity_log"]);
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const token = (await cookies()).get("omnisight_session")?.value;
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return jsonError(400, "INVALID_REQUEST", "Format permintaan tidak valid."); }
  const table_name = body.table_name;
  if (typeof table_name !== "string" || !TABLES.has(table_name)) return jsonError(400, "INVALID_REPORT_TABLE", "Tabel tidak tersedia untuk laporan.");
  try {
    const upstream = await backendRequest("reports/generate-pdf", { method: "POST", headers: { ...tokenHeaders(token), "content-type": "application/json" }, body: JSON.stringify({ table_name }) });
    if (!upstream.ok) return NextResponse.json({ error: { code: "REPORT_GENERATION_FAILED", message: "PDF tidak dapat dibuat." } }, { status: upstream.status });
    return new NextResponse(await upstream.arrayBuffer(), { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=\"omnisight-report.pdf\"", "cache-control": "private, no-store" } });
  } catch { return jsonError(503, "BACKEND_UNAVAILABLE", "Layanan laporan sedang tidak tersedia."); }
}
