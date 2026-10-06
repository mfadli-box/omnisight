import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

const FILES_ROOT = "/app/files";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path || path.length === 0) {
    return NextResponse.json({ code: "NOT_FOUND", error: "File not found", request_id: "" }, { status: 404 });
  }

  const relative = path.join("/");
  const fullPath = normalize(join(FILES_ROOT, relative));
  if (!fullPath.startsWith(FILES_ROOT)) {
    return NextResponse.json({ code: "NOT_FOUND", error: "File not found", request_id: "" }, { status: 404 });
  }

  try {
    const data = await readFile(fullPath);
    const name = path[path.length - 1];
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    const contentTypeMap: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
      txt: "text/plain",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const contentType = contentTypeMap[ext] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ code: "NOT_FOUND", error: "File not found", request_id: "" }, { status: 404 });
  }
}
