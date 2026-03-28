import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const logDate = searchParams.get('log_date')
  const days = searchParams.get('days') || '7'
  const view = searchParams.get('view')

  // Current snapshot view
  if (view === 'current') {
    const { data, error } = await sb
      .from('truck_inventory_current')
      .select('*')
      .eq('location_id', locationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // History view
  let query = sb.from('truck_inventory_log')
    .select('*, packages(code,name,contents,containers(code,name))')
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (locationId) query = query.eq('location_id', locationId)
  if (logDate) query = query.eq('log_date', logDate)
  else {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - Number(days))
    query = query.gte('log_date', fromDate.toISOString().split('T')[0])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const items = Array.isArray(body) ? body : [body]

  const { data, error } = await sb.from('truck_inventory_log').insert(items).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also update truck_inventory table for backward compatibility with packaging page
  for (const item of items) {
    if (item.log_type === 'count' || item.log_type === 'verified') {
      await sb.from('truck_inventory').upsert({
        location_id: item.location_id,
        package_id: item.package_id,
        quantity: item.quantity,
        updated_by: item.created_by || 'truck_staff'
      }, { onConflict: 'location_id,package_id' })
    }
  }

  return NextResponse.json(data)
}
