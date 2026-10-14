import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { sessionCookie } from "@/lib/utility";
import { BE_POOL } from "@/lib/backend";

const FILES_ROOT = "/app/files";

function unauthorized() {
  return NextResponse.json(
    { code: "UNAUTHORIZED", error: "Unauthorized", request_id: "" },
    { status: 401 },
  );
}

// Memvalidasi sesi ke backend. Cookie HttpOnly saja tidak cukup: token harus
// benar-benar aktif (tidak revoke/kedaluwarsa) sebelum berkas boleh dibaca.
async function isAuthenticated(raw: string | undefined): Promise<boolean> {
  if (!raw) return false;
  let token = "";
  try {
    const session = JSON.parse(decodeURIComponent(raw)) as {
      token?: string;
      expires_at?: string;
    };
    if (!session?.token || !session?.expires_at) return false;
    if (new Date(session.expires_at).getTime() <= Date.now()) return false;
    token = session.token;
  } catch {
    return false;
  }
  try {
    const res = await fetch(`${BE_POOL}/rest/pages/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const jar = await cookies();
  const raw = jar.get(sessionCookie)?.value;
  if (!(await isAuthenticated(raw))) {
    return unauthorized();
  }

  const { path } = await params;
  if (!path || path.length === 0) {
    return NextResponse.json({ code: "NOT_FOUND", error: "File not found", request_id: "" }, { status: 404 });
  }

  const relative = path.join("/");
  const fullPath = normalize(join(FILES_ROOT, relative));
  // Batas path yang ketat: hasil resolusi harus berada di dalam FILES_ROOT
  // (menggunakan pemisah path, bukan sekadar awalan string).
  if (fullPath !== FILES_ROOT && !fullPath.startsWith(FILES_ROOT + sep)) {
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
    const inline = ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "pdf";

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ code: "NOT_FOUND", error: "File not found", request_id: "" }, { status: 404 });
  }
}
