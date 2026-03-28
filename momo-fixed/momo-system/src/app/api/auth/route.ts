import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const { username, password } = await req.json()

  // Check app_users table
  const { data: user } = await sb
    .from('app_users')
    .select('*,locations(name)')
    .eq('username', username)
    .eq('password_hash', password)
    .eq('active', true)
    .single()

  // Fallback to legacy APP_PASSWORD for backward compatibility
  const legacyPassword = process.env.APP_PASSWORD || 'Salem2026'
  const isLegacy = !username && password === legacyPassword

  if (!user && !isLegacy) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const role = user?.role || 'manager'
  const locationId = user?.location_id || null
  const locationName = (user?.locations as any)?.name || null
  const displayName = user?.username || 'Manager'

  const res = NextResponse.json({ success: true, role, locationId, locationName, displayName })

  // Set auth cookie with user info
  const cookieVal = JSON.stringify({ username: displayName, role, locationId, locationName })
  res.cookies.set('momo_auth', cookieVal, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.delete('momo_auth')
  return res
}
