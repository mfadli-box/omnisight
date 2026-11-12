/**
 * Secure API Proxy (BFF) — core forwarding browser -> Rust API.
 *
 * Jaminan keamanan:
 *  1. Base URL upstream = konfigurasi tetap `RUST_API_INTERNAL_URL` (bukan
 *     input user) → tidak ada SSRF via host.
 *  2. Method allowlist + path allowlist Wave 1 (default-deny) + normalisasi
 *     anti-traversal (lihat `proxy-policy.ts`).
 *  3. Origin/Referer same-origin untuk method mutating (CSRF).
 *  4. Cookie HttpOnly → `Authorization: Bearer` server-to-server; token
 *     tidak pernah dikirim dari klien dan tidak pernah dibalas ke klien.
 *     Respons auth (login/verify/switch) di-intercept: token disetel sebagai
 *     cookie HttpOnly lalu DISTrip dari body JSON.
 *  5. Request header & response header memakai ALLOWLIST — `set-cookie`,
 *     `cookie`, `host`, `x-forwarded-*` tidak pernah lewat.
 *  6. Passthrough streaming dua arah: body `ReadableStream` diteruskan
 *     tanpa buffering (`duplex: 'half'`), respons mengalir langsung ke
 *     browser (Excel export, file RustFS) tanpa `await response.arrayBuffer()`.
 *  7. `X-Correlation-ID` selalu di-propagasi: diambil dari klien bila wajar,
 *     selain itu di-generate UUID; selalu di-echo pada respons.
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
  resolveCorrelationId,
  sameOriginOk,
} from '@/infrastructure/security/proxy-policy'
import {
  MFA_CHALLENGE_COOKIE,
  MFA_CHALLENGE_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  tokenCookieOptions,
} from '@/infrastructure/security/session'

export type ProxyResult = {
  ok: boolean
  response: Response
}

/** Path upstream auth yang butuh intercept cookie (body JSON kecil, non-stream). */
const AUTH_COOKIE_ROUTES = {
  login: '/api/v1/auth/login',
  mfaVerify: '/api/v1/auth/mfa/verify',
  switchCompany: '/api/v1/auth/switch-company',
  logout: '/api/v1/auth/logout',
} as const

export async function forwardToRustApi(req: NextRequest): Promise<ProxyResult> {
  // --- 1) Method allowlist -------------------------------------------------
  if (!isAllowedMethod(req.method)) {
    return {
      ok: false,
      response: errorResponse(405, 'METHOD_NOT_ALLOWED', 'Metode tidak diizinkan oleh proxy'),
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
      response: errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Payload melebihi batas proxy'),
    }
  }

  // --- 5) Correlation ID: propagasi / generate ------------------------------
  const correlationId = resolveCorrelationId(req.headers)

  // --- 6) Header upstream: ALLOWLIST ---------------------------------------
  const headers = new Headers()
  copyAllowedRequestHeaders(req.headers, headers)
  headers.set('x-correlation-id', correlationId)

  // --- 7) Auth: token HANYA dari cookie HttpOnly server-side ---------------
  const token = sessionToken(req)
  if (token) headers.set('authorization', `Bearer ${token}`)

  // --- 8) Route auth ber-cookie: intercept respons (JSON kecil) ------------
  if (
    req.method === 'POST' &&
    (upstreamPath === AUTH_COOKIE_ROUTES.login ||
      upstreamPath === AUTH_COOKIE_ROUTES.mfaVerify ||
      upstreamPath === AUTH_COOKIE_ROUTES.switchCompany ||
      upstreamPath === AUTH_COOKIE_ROUTES.logout)
  ) {
    return handleAuthRoute(req, upstreamPath, headers, correlationId)
  }

  // --- 9) Passthrough streaming request body -------------------------------
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(appConfig.timeoutMs),
  }
  if (hasBody) {
    // wajib untuk stream body di Node fetch (undici)
    ;(init as RequestInit & { duplex: 'half' }).duplex = 'half'
  }

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
        correlationId,
      ),
    }
  }

  // --- 10) Respons: stream balik ke browser, header ALLOWLIST ---------------
  const resHeaders = new Headers()
  copyAllowedResponseHeaders(upstream.headers, resHeaders)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    resHeaders.set(key, value)
  }
  resHeaders.set('x-correlation-id', upstream.headers.get('x-correlation-id') ?? correlationId)

  return {
    ok: upstream.ok,
    response: new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    }),
  }
}

function sessionToken(req: NextRequest): string | null {
  // Re-import di sini untuk menjaga fungsi murni; sama seperti session.ts.
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token || token.length === 0 || token.length > 4096 || /[\s\0]/.test(token)) {
    return null
  }
  return token
}

/**
 * Intercept route auth: body JSON di-buffer (payload kecil, bukan binary),
 * token dipindah ke cookie HttpOnly lalu DISTrip dari body sebelum sampai
 * ke browser.
 */
async function handleAuthRoute(
  req: NextRequest,
  upstreamPath: string,
  headers: Headers,
  correlationId: string,
): Promise<ProxyResult> {
  let upstream: Response
  try {
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers,
      body: req.body,
      duplex: 'half',
      redirect: 'manual',
      signal: AbortSignal.timeout(appConfig.timeoutMs),
    }
    upstream = await fetch(`${appConfig.rustApiInternalUrl}${upstreamPath}`, init)
  } catch {
    return {
      ok: false,
      response: errorResponse(
        502,
        'UPSTREAM_UNREACHABLE',
        'Layanan backend tidak dapat dijangkau',
        correlationId,
      ),
    }
  }

  const contentType = upstream.headers.get('content-type') ?? ''
  if (!upstream.ok || !contentType.includes('application/json')) {
    // Gagal auth (401/429/502 dst.) — teruskan apa adanya, hapus cookie lama.
    if (upstreamPath !== AUTH_COOKIE_ROUTES.login) {
      // verify/switch gagal → challenge mungkin expired; logout → bersihkan.
      return {
        ok: false,
        response: withCookie(
          upstream,
          correlationId,
          upstreamPath === AUTH_COOKIE_ROUTES.logout
            ? { name: SESSION_COOKIE, value: '', maxAge: 0 }
            : null,
        ),
      }
    }
    return { ok: false, response: withCookie(upstream, correlationId, null) }
  }

  let payload: Record<string, unknown>
  try {
    payload = (await upstream.json()) as Record<string, unknown>
  } catch {
    return {
      ok: false,
      response: errorResponse(502, 'UPSTREAM_INVALID', 'Respons upstream tidak valid', correlationId),
    }
  }

  const data = (payload.data ?? {}) as Record<string, unknown>
  // Token DISTrip dari body sebelum respons dibangun — JWT tidak pernah
  // sampai ke bundle/browser, hanya cookie HttpOnly.
  const sanitized = sanitizeAuthPayload(payload)

  const response = NextResponse.json(sanitized, {
    status: upstream.status,
    headers: { ...SECURITY_HEADERS, 'x-correlation-id': correlationId },
  })

  if (upstreamPath === AUTH_COOKIE_ROUTES.login) {
    if (data.mfa_required === true) {
      // Challenge token → cookie HttpOnly 5 menit; body sudah distrip.
      const challenge = typeof data.mfa_challenge_token === 'string' ? data.mfa_challenge_token : ''
      response.cookies.set(
        MFA_CHALLENGE_COOKIE,
        challenge,
        tokenCookieOptions(MFA_CHALLENGE_MAX_AGE),
      )
      response.cookies.set(SESSION_COOKIE, '', tokenCookieOptions(0))
      return { ok: true, response }
    }
    // Sukses langsung → cookie sesi penuh.
    const accessToken = typeof data.access_token === 'string' ? data.access_token : ''
    response.cookies.set(MFA_CHALLENGE_COOKIE, '', tokenCookieOptions(0))
    response.cookies.set(SESSION_COOKIE, accessToken, tokenCookieOptions(SESSION_MAX_AGE))
    return { ok: true, response }
  }

  if (upstreamPath === AUTH_COOKIE_ROUTES.mfaVerify) {
    const accessToken = typeof data.access_token === 'string' ? data.access_token : ''
    response.cookies.set(MFA_CHALLENGE_COOKIE, '', tokenCookieOptions(0))
    response.cookies.set(SESSION_COOKIE, accessToken, tokenCookieOptions(SESSION_MAX_AGE))
    return { ok: true, response }
  }

  if (upstreamPath === AUTH_COOKIE_ROUTES.switchCompany) {
    // Rotasi cookie sesi dengan JWT baru (klaim active_company_id baru).
    const accessToken = typeof data.access_token === 'string' ? data.access_token : ''
    response.cookies.set(SESSION_COOKIE, accessToken, tokenCookieOptions(SESSION_MAX_AGE))
    return { ok: true, response }
  }

  // logout — hapus kedua cookie.
  response.cookies.set(SESSION_COOKIE, '', tokenCookieOptions(0))
  response.cookies.set(MFA_CHALLENGE_COOKIE, '', tokenCookieOptions(0))
  return { ok: true, response }
}

/**
 * Salinan payload tanpa `access_token` / `mfa_challenge_token` /
 * `token_type` — token hanya berpindah via Set-Cookie HttpOnly.
 */
function sanitizeAuthPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = { ...((payload.data ?? {}) as Record<string, unknown>) }
  delete data.access_token
  delete data.mfa_challenge_token
  delete data.token_type
  return { ...payload, data }
}

/** Bungkus ulang respons upstream (non-JSON) dengan cookie opsional. */
function withCookie(
  upstream: Response,
  correlationId: string,
  cookie: { name: string; value: string; maxAge: number } | null,
): Response {
  const headers = new Headers()
  copyAllowedResponseHeaders(upstream.headers, headers)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }
  headers.set('x-correlation-id', upstream.headers.get('x-correlation-id') ?? correlationId)
  const res = new Response(upstream.body, { status: upstream.status, headers })
  if (cookie) {
    res.headers.append(
      'set-cookie',
      serializeClearedCookie(cookie.name),
    )
  }
  return res
}

function serializeClearedCookie(name: string): string {
  const opts = tokenCookieOptions(0)
  return `${name}=; Path=${opts.path}; HttpOnly; SameSite=Lax; Max-Age=0`
}

/** Envelope error konsisten dengan Rust API (osc_docs/rest). */
function errorResponse(
  status: number,
  code: string,
  message: string,
  correlationId?: string,
): NextResponse {
  return NextResponse.json(
    { status: 'error', error: { code, message }, correlation_id: correlationId },
    { status, headers: { ...SECURITY_HEADERS } },
  )
}
