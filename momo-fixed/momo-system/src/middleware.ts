import { NextRequest, NextResponse } from 'next/server'

const PASSWORD = process.env.APP_PASSWORD || 'Salem2026'
const COOKIE_NAME = 'momo_auth'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip API routes
  if (pathname.startsWith('/api')) return NextResponse.next()

  // Check auth cookie
  const auth = req.cookies.get(COOKIE_NAME)?.value
  if (auth === PASSWORD) return NextResponse.next()

  // Redirect to login if not authenticated
  if (pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
