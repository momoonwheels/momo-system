import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const sb = createServerClient()
  const { data, error } = await sb
    .from('app_users')
    .select('id,username,role,location_id,active,created_at,locations(name)')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const { data, error } = await sb.from('app_users').insert({
    username: body.username,
    password_hash: body.password,
    role: body.role,
    location_id: body.location_id || null,
    active: true
  }).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const updates: any = { role: body.role, active: body.active, location_id: body.location_id || null }
  if (body.password) updates.password_hash = body.password
  const { data, error } = await sb.from('app_users').update(updates).eq('id', body.id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const { error } = await sb.from('app_users').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
