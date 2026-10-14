import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookie } from "@/lib/utility";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/board")) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get(sessionCookie)?.value;
  if (!cookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    const session = JSON.parse(decodeURIComponent(cookie));
    if (!session?.expires_at) return NextResponse.redirect(new URL("/login", req.url));
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/board/:path*"],
};
