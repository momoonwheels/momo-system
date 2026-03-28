import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  let query = sb.from('truck_inventory')
    .select('*, packages(id,code,name,contents,size_qty,size_unit,containers(code,name))')
  if (locationId) query = query.eq('location_id', locationId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const items = Array.isArray(body) ? body : [body]
  const { data, error } = await sb.from('truck_inventory')
    .upsert(items, { onConflict: 'location_id,package_id' }).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
