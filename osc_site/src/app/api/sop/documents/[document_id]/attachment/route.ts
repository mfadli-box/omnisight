import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, backendError, backendRequest, jsonError, tokenHeaders } from "@/services/backend";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ document_id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  const requestSize = Number(request.headers.get("content-length") || 0);
  if (!requestSize || requestSize > 21 * 1024 * 1024) return jsonError(413, "INVALID_FILE_SIZE", "Unggahan dibatasi hingga 20 MiB.");
  const { document_id } = await params;
  if (!UUID.test(document_id)) return jsonError(400, "INVALID_DOCUMENT", "Dokumen tidak valid.");
  const token = (await cookies()).get("omnisight_session")?.value;
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 20 * 1024 * 1024) return jsonError(400, "INVALID_FILE", "Pilih file berukuran maksimal 20 MiB.");
  const allowed = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);
  if (!allowed.has(file.type)) return jsonError(400, "INVALID_FILE_TYPE", "Tipe file harus PDF, DOCX, atau TXT.");
  try {
    const upstream = await backendRequest(`sop/documents/${document_id}/attachment`, { method: "POST", headers: { ...tokenHeaders(token), "content-type": file.type }, body: await file.arrayBuffer() });
    if (!upstream.ok) { const error = await backendError(upstream); return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status }); }
    return NextResponse.json({ data: { uploaded: true, document_id } });
  } catch { return jsonError(503, "STORAGE_UNAVAILABLE", "Penyimpanan dokumen belum tersedia."); }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { document_id } = await params;
  if (!UUID.test(document_id)) return jsonError(400, "INVALID_DOCUMENT", "Dokumen tidak valid.");
  const token = (await cookies()).get("omnisight_session")?.value;
  if (!token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  try {
    const upstream = await backendRequest(`sop/documents/${document_id}/attachment`, { headers: tokenHeaders(token) });
    if (!upstream.ok) { const error = await backendError(upstream); return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status }); }
    const headers = new Headers({ "content-type": upstream.headers.get("content-type") || "application/octet-stream", "content-disposition": "attachment; filename=\"sop-attachment\"", "cache-control": "private, no-store" });
    return new NextResponse(await upstream.arrayBuffer(), { headers });
  } catch { return jsonError(503, "STORAGE_UNAVAILABLE", "Penyimpanan dokumen belum tersedia."); }
}
