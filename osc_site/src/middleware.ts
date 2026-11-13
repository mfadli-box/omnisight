import { NextResponse, type NextRequest } from 'next/server'

/**
 * Edge middleware — lapisan pertama RBAC:
 *  - Path terproteksi (di luar daftar publik) tanpa cookie sesi → redirect /login.
 *  - User terautentikasi yang membuka /login → redirect /dashboard.
 * Re-verifikasi privilege tetap dilakukan di server component (layout) —
 * middleware HANYA memeriksa keberadaan cookie, bukan isi privilege.
 */

const PUBLIC_PATHS = new Set(['/', '/login', '/api/health', '/api/proxy'])

function hasSession(req: NextRequest): boolean {
  const token = req.cookies.get('osc_session')?.value
  return typeof token === 'string' && token.length > 0 && !/[\s\0]/.test(token)
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/')
  const authed = hasSession(req)

  if (!isPublic && !authed) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (pathname === '/login' && authed) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
