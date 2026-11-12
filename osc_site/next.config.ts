import type { NextConfig } from 'next'

/**
 * Konfigurasi osc_site.
 * - `output: 'standalone'` untuk image Docker minimal (server.js).
 * - Security headers dipasang global; CSP bootstrap memakai 'unsafe-inline'
 *   untuk style/script Next.js — ditingkatkan ke nonce-based CSP bersama
 *   middleware auth pada fase berikutnya.
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Referrer-Policy',
            // `no-referrer` global — konsisten dengan SECURITY_HEADERS proxy
            // (header global next.config berlaku juga pada route handler dan
            // menimpa nilai handler, jadi keduanya WAJIB sama).
            value: 'no-referrer',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]
  },
}

export default nextConfig
