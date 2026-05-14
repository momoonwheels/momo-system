import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

// GET /api/square-mapping
// → { mappings: [{ app_location_id, square_location_id, square_name }] }
export async function GET() {
  const sb = createServerClient()
  const { data, error } = await sb.from('square_locations').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mappings: data || [] })
}

// PUT /api/square-mapping
// body: { app_location_id, square_location_id, square_name }
export async function PUT(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const { app_location_id, square_location_id, square_name } = body
  if (!app_location_id || !square_location_id) {
    return NextResponse.json({ error: 'app_location_id and square_location_id required' }, { status: 400 })
  }
  const { error } = await sb.from('square_locations').upsert(
    {
      square_location_id,
      square_name: square_name || '',
      app_location_id,
    },
    { onConflict: 'square_location_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
