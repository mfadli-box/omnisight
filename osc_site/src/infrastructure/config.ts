/**
 * Konfigurasi runtime osc_site — dibaca SERVER-SIDE saja.
 * ATURAN: TIDAK ada variabel NEXT_PUBLIC_* berisi URL internal/secret;
 * seluruh nilai di sini tidak boleh sampai ke bundle browser.
 */

export interface AppConfig {
  /** Endpoint Rust API untuk server-to-server (BFF). */
  rustApiInternalUrl: string
  /** Origin publik situs — pembanding Origin/Referer (proteksi CSRF). */
  sitePublicUrl: string
  /** Batas ukuran body proxy (pre-check; batas final di osc_rest). */
  maxBodyBytes: number
  /** Timeout request server-to-server ke Rust API. */
  timeoutMs: number
}

function httpUrlEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim() || fallback
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`${name} bukan URL valid: ${raw}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} harus ber-scheme http(s): ${raw}`)
  }
  return raw
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  if (Number.isNaN(parsed)) return fallback
  if (parsed < min || parsed > max) {
    throw new Error(`${name} di luar rentang wajar (${min}..${max}): ${parsed}`)
  }
  return parsed
}

export const appConfig: AppConfig = {
  rustApiInternalUrl: httpUrlEnv('RUST_API_INTERNAL_URL', 'http://osc_rest:8000'),
  sitePublicUrl: httpUrlEnv('SITE_PUBLIC_URL', 'http://localhost:3000'),
  maxBodyBytes: intEnv('PROXY_MAX_BODY_MB', 25, 1, 512) * 1024 * 1024,
  timeoutMs: intEnv('RUST_API_TIMEOUT_MS', 30_000, 1_000, 300_000),
}
