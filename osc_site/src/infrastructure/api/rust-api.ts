/**
 * Secure API Proxy (BFF) — core forwarding browser -> Rust API.
 *
 * Jaminan keamanan:
 *  1. Base URL upstream = konfigurasi tetap `RUST_API_INTERNAL_URL` (bukan
 *     input user) → tidak ada SSRF via host.
 *  2. Method allowlist + path allowlist (default-deny) + normalisasi
 *     anti-traversal (lihat `proxy-policy.ts`).
 *  3. Origin/Referer same-origin untuk method mutating (CSRF).
 *  4. Cookie HttpOnly → `Authorization: Bearer` server-to-server; token
 *     tidak pernah dikirim dari klien dan tidak pernah dibalas ke klien.
 *  5. Request header & response header memakai ALLOWLIST — `set-cookie`,
 *     `cookie`, `host`, `x-forwarded-*` tidak pernah lewat.
 *  6. Passthrough streaming dua arah: body `ReadableStream` diteruskan
 *     tanpa buffering (`duplex: 'half'`), respons mengalir langsung ke
 *     browser tanpa `await response.arrayBuffer()`.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { appConfig } from '@/infrastructure/config'
import {
  SECURITY_HEADERS,
  copyAllowedRequestHeaders,
  copyAllowedResponseHeaders,
  isAllowedMethod,
  isAllowedPath,
  normalizeProxyPath,
  requiresSameOrigin,
  sameOriginOk,
} from '@/infrastructure/security/proxy-policy'
import { sessionTokenFromCookie } from '@/infrastructure/security/session'

export type ProxyResult = {
  ok: boolean
  response: Response
}

export async function forwardToRustApi(req: NextRequest): Promise<ProxyResult> {
  // --- 1) Method allowlist -------------------------------------------------
  if (!isAllowedMethod(req.method)) {
    return {
      ok: false,
      response: errorResponse(
        405,
        'METHOD_NOT_ALLOWED',
        'Metode tidak diizinkan oleh proxy',
      ),
    }
  }

  // --- 2) Path: normalisasi anti-traversal + whitelist (default-deny) ------
  const upstreamPath = normalizeProxyPath(req.nextUrl.pathname)
  if (!upstreamPath) {
    return {
      ok: false,
      response: errorResponse(400, 'INVALID_PATH', 'Path proxy tidak valid'),
    }
  }
  if (!isAllowedPath(upstreamPath)) {
    return {
      ok: false,
      response: errorResponse(
        404,
        'PATH_NOT_ALLOWED',
        'Endpoint tidak didaftarkan pada proxy',
      ),
    }
  }

  // --- 3) CSRF: method mutating wajib same-origin ---------------------------
  if (requiresSameOrigin(req.method) && !sameOriginOk(req.headers)) {
    return {
      ok: false,
      response: errorResponse(403, 'ORIGIN_REJECTED', 'Origin tidak dikenal'),
    }
  }

  // --- 4) Pre-check ukuran body (batas final tetap di osc_rest) -------------
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > appConfig.maxBodyBytes) {
    return {
      ok: false,
      response: errorResponse(
        413,
        'PAYLOAD_TOO_LARGE',
        'Payload melebihi batas proxy',
      ),
    }
  }

  // --- 5) Header upstream: ALLOWLIST ---------------------------------------
  const headers = new Headers()
  copyAllowedRequestHeaders(req.headers, headers)

  // --- 6) Auth: token HANYA dari cookie HttpOnly server-side ---------------
  const token = sessionTokenFromCookie(req)
  if (token) headers.set('authorization', `Bearer ${token}`)

  // --- 7) Passthrough streaming request body -------------------------------
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(appConfig.timeoutMs),
  }
  if (hasBody) init.duplex = 'half' // wajib untuk stream body di Node fetch

  let upstream: Response
  try {
    upstream = await fetch(`${appConfig.rustApiInternalUrl}${upstreamPath}`, init)
  } catch {
    // Timeout/network — detail internal tidak dibocorkan ke klien.
    return {
      ok: false,
      response: errorResponse(
        502,
        'UPSTREAM_UNREACHABLE',
        'Layanan backend tidak dapat dijangkau',
      ),
    }
  }

  // --- 8) Respons: stream balik ke browser, header ALLOWLIST ---------------
  const resHeaders = new Headers()
  copyAllowedResponseHeaders(upstream.headers, resHeaders)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    resHeaders.set(key, value)
  }

  return {
    ok: true,
    response: new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    }),
  }
}

/** Envelope error konsisten dengan Rust API (osc_docs/rest). */
function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    { status: 'error', error: { code, message } },
    { status, headers: { ...SECURITY_HEADERS } },
  )
}
