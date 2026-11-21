import { proxyRequestSchema } from "@/services/proxy-validation";
import { attachmentTypes } from "@/validations/sop.schema";
import { reportTables } from "@/validations/report.schema";
import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin, backendError, backendRequest, jsonError, readBody, sessionToken, tokenHeaders,
} from "@/services/backend";

const uuid = "[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}";
const containerId = "[a-f0-9]{12,64}";
const resources = "(?:nodes|pam/targets|sop-documents|companies|areas|stores|users)";
const tables = `(?:${Object.keys(reportTables).join("|")})`;
const jsonRoutes = {
  GET: new RegExp(`^(?:public/companies|me/(?:navigation|contexts)|${resources}(?:/${uuid})?|nodes/${uuid}/metrics|agents/status|containers|security/sbom|stacks(?:/${uuid})?|pam/terminal/nodes|roles|company-menus|audit-logs|companies/${uuid}/connector)$`),
  POST: new RegExp(`^(?:${resources}|roles|containers/${containerId}/action|stacks(?:/${uuid}/action)?|pam/terminal|pam/sessions/authorize|users/${uuid}/mfa/reset|reports/generate-pdf)$`),
  PATCH: new RegExp(`^(?:${resources}/${uuid}|companies/${uuid}/connector)$`),
  PUT: new RegExp(`^company-menus/${uuid}/[A-Z]{2}[0-9]{2}$`),
  DELETE: new RegExp(`^${resources}/${uuid}$`),
};
const attachment = new RegExp(`^sop-documents/${uuid}/attachment$`);
const reportDownload = new RegExp(`^reports/(?:export-excel/${tables}|archives/${uuid})$`);
const logStream = new RegExp(`^(?:stacks/${uuid}/logs/${uuid}|pam/terminal/${uuid}/logs)$`);
type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, { params }: Context) {
  const { path: segments } = await params;
  if (segments.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))) {
    return jsonError(404, "NOT_FOUND", "Rute tidak tersedia.");
  }
  const path = segments.join("/");
  const method = request.method as keyof typeof jsonRoutes;
  const isAttachment = attachment.test(path);
  const isDownload = (method === "GET" && (isAttachment || reportDownload.test(path)))
    || (method === "POST" && path === "reports/generate-pdf");
  const isStream = method === "GET" && logStream.test(path);
  const isUpload = method === "POST" && isAttachment;
  if (!jsonRoutes[method]?.test(path) && !isDownload && !isUpload && !isStream) {
    return jsonError(404, "NOT_FOUND", "Rute tidak tersedia.");
  }

  const isPublic = path === "public/companies";
  const token = isPublic ? undefined : await sessionToken();
  if (!isPublic && !token) return jsonError(401, "UNAUTHENTICATED", "Sesi telah berakhir.");
  if (method !== "GET" && !assertSameOrigin(request)) {
    return jsonError(403, "CSRF_BLOCKED", "Permintaan tidak berasal dari origin yang sama.");
  }

  const headers = new Headers(token ? tokenHeaders(token) : undefined);
  if (isStream) {
    headers.set("accept", "text/event-stream");
    const lastEvent = request.headers.get("last-event-id");
    if (lastEvent) headers.set("last-event-id", lastEvent);
  }
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  const expectsBody = method !== "GET" && method !== "DELETE" && !path.endsWith("/mfa/reset");
  const bodyLimit = isUpload ? 20 * 1024 * 1024 : path.startsWith("stacks/") ? 512 * 1024 : 300 * 1024;
  let body: ArrayBuffer | undefined;
  if (expectsBody) {
    if (!contentType || !(isUpload ? Object.values(attachmentTypes).some((type) => type === contentType) : contentType === "application/json")) {
      return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "Tipe konten tidak didukung.");
    }
    if (Number(request.headers.get("content-length")) > bodyLimit) {
      return jsonError(413, "REQUEST_TOO_LARGE", "Permintaan terlalu besar.");
    }
    try {
      body = await readBody(request, bodyLimit);
    } catch {
      return jsonError(400, "INVALID_REQUEST", "Body permintaan tidak dapat dibaca.");
    }
    if (!body) return jsonError(413, "REQUEST_TOO_LARGE", "Permintaan terlalu besar.");
    if (!isUpload) {
      const schema = proxyRequestSchema(method, path);
      let input: unknown;
      try {
        input = JSON.parse(new TextDecoder().decode(body));
      } catch {
        return jsonError(400, "INVALID_REQUEST", "Format permintaan tidak valid.");
      }
      const validated = schema?.safeParse(input);
      if (!validated?.success) return jsonError(400, "INVALID_INPUT", "Periksa kembali data yang dikirim.");
      body = new TextEncoder().encode(JSON.stringify(validated.data)).buffer;
    }
    headers.set("content-type", contentType);
  }

  try {
    const upstream = await backendRequest(path + request.nextUrl.search, { method, headers, body, signal: request.signal }, isStream ? 45_000 : undefined);
    if (upstream.status >= 300 && upstream.status < 400) {
      return jsonError(502, "BACKEND_RESPONSE_INVALID", "Respons layanan tidak valid.");
    }
    if (!upstream.ok) {
      const { status, code, message } = await backendError(upstream);
      return jsonError(status, code, message);
    }

    const responseHeaders = new Headers({ "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
    if (isStream) {
      if (!upstream.headers.get("content-type")?.startsWith("text/event-stream") || !upstream.body) {
        return jsonError(502, "BACKEND_RESPONSE_INVALID", "Respons log tidak valid.");
      }
      responseHeaders.set("content-type", "text/event-stream; charset=utf-8");
      responseHeaders.set("x-accel-buffering", "no");
      responseHeaders.set("cache-control", "private, no-store, no-transform");
    } else if (isDownload) {
      responseHeaders.set("content-type", upstream.headers.get("content-type") || "application/octet-stream");
      const filename = isAttachment ? "sop-attachment" : method === "POST" ? "omnisight.pdf" : "omnisight-report";
      responseHeaders.set("content-disposition", upstream.headers.get("content-disposition")?.match(/^attachment(?:;|$)/i)
        ? upstream.headers.get("content-disposition")! : `attachment; filename="${filename}"`);
      const archiveId = upstream.headers.get("x-report-archive-id");
      if (archiveId) responseHeaders.set("x-report-archive-id", archiveId);
    } else {
      responseHeaders.set("content-type", "application/json");
    }
    return new NextResponse(upstream.status === 204 ? null : upstream.body, {
      status: upstream.status, headers: responseHeaders,
    });
  } catch {
    return jsonError(503, "BACKEND_UNAVAILABLE", "Layanan sedang tidak tersedia.");
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
