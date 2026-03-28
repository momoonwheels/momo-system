import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip API routes and static files
  if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return NextResponse.next()
  }

  // Check auth cookie
  const authCookie = req.cookies.get('momo_auth')?.value

  if (!authCookie) {
    if (pathname !== '/login') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    return NextResponse.next()
  }

  // Try to parse new JSON format
  try {
    const auth = JSON.parse(authCookie)
    if (!auth.username) throw new Error('invalid')

    // Truck staff can only access truck-inventory
    if ((auth.role === 'lc_truck' || auth.role === 'salem_truck') &&
        pathname !== '/truck-inventory' && pathname !== '/login') {
      return NextResponse.redirect(new URL('/truck-inventory', req.url))
    }
    return NextResponse.next()
  } catch {
    // Legacy string password format
    const legacyPassword = process.env.APP_PASSWORD || 'Salem2026'
    if (authCookie === legacyPassword) return NextResponse.next()
    if (pathname !== '/login') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    return NextResponse.next()
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
