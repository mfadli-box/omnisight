/**
 * Typed HTTP client untuk komponen klien (browser).
 * ATURAN: SELALU menuju BFF proxy internal `/api/proxy/...`; tidak pernah
 * langsung ke Rust API. Cookie HttpOnly dikirim browser secara same-origin.
 *
 * Semua request menyuntik `X-Correlation-ID` (UUID) untuk propagasi trace
 * end-to-end ke osc_rest; error envelope dilempar sebagai `ApiClientError`.
 */

import { z } from 'zod'

import { ApiClientError, type ApiErrorEnvelope } from '@/domain/errors'
import { proxyFetch as rawProxyFetch } from '@/infrastructure/http/proxy-client'

const PROXY_BASE = '/api/proxy'

/** proxyFetch + injeksi `X-Correlation-ID` (propagasi trace). */
export async function proxyFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return rawProxyFetch(path, {
    ...init,
    headers: {
      'x-correlation-id': newCorrelationId(),
      ...(init?.headers ?? {}),
    },
  })
}

/** UUID untuk header X-Correlation-ID (propagasi trace ke osc_rest). */
export function newCorrelationId(): string {
  return crypto.randomUUID()
}

const errorEnvelopeSchema = z.object({
  status: z.literal('error'),
  error: z.object({ code: z.string(), message: z.string() }),
  correlation_id: z.string().optional(),
})

/** Parse envelope error upstream menjadi ApiClientError. */
export async function toClientError(res: Response): Promise<ApiClientError> {
  let code = 'UPSTREAM_ERROR'
  let message = `Permintaan gagal (HTTP ${res.status})`
  let correlationId: string | null = res.headers.get('x-correlation-id')
  try {
    const body = (await res.json()) as unknown
    const parsed = errorEnvelopeSchema.safeParse(body)
    if (parsed.success) {
      const envelope = parsed.data as ApiErrorEnvelope
      code = envelope.error.code
      message = envelope.error.message
      correlationId = envelope.correlation_id ?? correlationId
    }
  } catch {
    // body bukan JSON — pakai default.
  }
  return new ApiClientError(code, message, res.status, correlationId)
}

/**
 * GET/POST JSON via proxy; respons divalidasi Zod (`data` envelope sukses).
 * Melempar `ApiClientError` bila upstream error.
 */
export async function apiJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await proxyFetch(path, init)
  if (!res.ok) throw await toClientError(res)
  const body = (await res.json()) as { data?: unknown }
  const parsed = schema.safeParse(body.data ?? body)
  if (!parsed.success) {
    throw new ApiClientError(
      'RESPONSE_INVALID',
      'Struktur respons backend tidak dikenali',
      res.status,
      res.headers.get('x-correlation-id'),
    )
  }
  return parsed.data
}

/** POST JSON body helper. */
export function jsonInit(method: string, payload: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

/**
 * Upload multipart dengan progres (XHR — fetch belum punya upload progress).
 * Body diteruskan proxy apa adanya (passthrough stream ke osc_rest).
 */
export function apiUploadWithProgress(
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${PROXY_BASE}${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('x-correlation-id', newCorrelationId())
    if (signal) {
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText) as unknown
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body)
      } else {
        const parsed = errorEnvelopeSchema.safeParse(body)
        reject(
          parsed.success
            ? new ApiClientError(
                parsed.data.error.code,
                parsed.data.error.message,
                xhr.status,
                parsed.data.correlation_id,
              )
            : new ApiClientError('UPSTREAM_ERROR', `Upload gagal (HTTP ${xhr.status})`, xhr.status),
        )
      }
    }
    xhr.onerror = () =>
      reject(new ApiClientError('NETWORK_ERROR', 'Koneksi ke server terputus', 0))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

/**
 * Unduhan binary streaming (Excel export / file RustFS) via proxy.
 * Body dibaca sebagai stream lalu dibungkus Blob; URL object di-revoke
 * pemanggil setelah anchor diklik. Filename disanitasi dari
 * `Content-Disposition` upstream.
 */
export async function downloadBinary(
  path: string,
  fallbackFilename: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await proxyFetch(path)
  if (!res.ok) throw await toClientError(res)
  const disposition = res.headers.get('content-disposition')
  const raw = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1]
    ?? /filename="?([^";]+)"?/i.exec(disposition ?? '')?.[1]
    ?? fallbackFilename
  const filename =
    raw.replace(/[^A-Za-z0-9 ._\-]/g, '_').replace(/\.{2,}/g, '.').trim() ||
    fallbackFilename
  // Stream → Blob (tanpa memotong aliran; revoke oleh pemanggil).
  const blob = await res.blob()
  return { blob, filename }
}
