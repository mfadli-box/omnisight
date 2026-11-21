import { reportSchema } from "@/validations/report.schema";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendRequest, jsonError, readAuthInput, tokenHeaders } from "@/services/backend";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const token = (await cookies()).get("omnisight_session")?.value;
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  const input = reportSchema.safeParse(await readAuthInput(request).catch(() => null));
  if (!input.success) return jsonError(400, "INVALID_REPORT_TABLE", "Tabel tidak tersedia untuk laporan.");
  try {
    const upstream = await backendRequest("reports/generate-pdf", { method: "POST", headers: { ...tokenHeaders(token), "content-type": "application/json" }, body: JSON.stringify(input.data) });
    if (!upstream.ok) return NextResponse.json({ error: { code: "REPORT_GENERATION_FAILED", message: "PDF tidak dapat dibuat." } }, { status: upstream.status });
    return new NextResponse(await upstream.arrayBuffer(), { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=\"omnisight-report.pdf\"", "cache-control": "private, no-store" } });
  } catch { return jsonError(503, "BACKEND_UNAVAILABLE", "Layanan laporan sedang tidak tersedia."); }
}
