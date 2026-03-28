import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const weekStart = searchParams.get('week_start')
  let query = sb.from('planned_orders').select('*, menu_items(id,code,name,sort_order), locations(id,name)')
  if (locationId) query = query.eq('location_id', locationId)
  if (weekStart) query = query.eq('week_start', weekStart)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const { data, error } = await sb.from('planned_orders')
    .upsert(body, { onConflict: 'location_id,menu_item_id,week_start' }).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
