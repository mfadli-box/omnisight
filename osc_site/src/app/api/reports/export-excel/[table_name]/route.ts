import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { backendRequest, jsonError, tokenHeaders } from "@/lib/server/backend";

const TABLES = new Set(["osc_sop_document", "osc_pam_session", "osc_agent_node", "osc_activity_log"]);
export async function GET(_request: NextRequest, { params }: { params: Promise<{ table_name: string }> }) {
  const { table_name } = await params;
  if (!TABLES.has(table_name)) return jsonError(400, "INVALID_REPORT_TABLE", "Tabel tidak tersedia untuk ekspor.");
  const token = (await cookies()).get("omnisight_session")?.value;
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  try {
    const upstream = await backendRequest(`reports/export-excel/${table_name}`, { headers: tokenHeaders(token) });
    if (!upstream.ok) return NextResponse.json({ error: { code: "REPORT_EXPORT_FAILED", message: "Ekspor tidak dapat dibuat." } }, { status: upstream.status });
    return new NextResponse(await upstream.arrayBuffer(), { headers: { "content-type": upstream.headers.get("content-type") || "application/octet-stream", "content-disposition": "attachment; filename=\"omnisight-report.xlsx\"", "cache-control": "private, no-store" } });
  } catch { return jsonError(503, "BACKEND_UNAVAILABLE", "Layanan laporan sedang tidak tersedia."); }
}
