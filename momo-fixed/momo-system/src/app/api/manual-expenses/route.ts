import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  let query = sb.from('manual_expenses').select('*').order('expense_date', { ascending: false })
  if (locationId && locationId !== 'all') query = query.eq('location_id', locationId)
  if (startDate) query = query.gte('expense_date', startDate)
  if (endDate) query = query.lte('expense_date', endDate)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const { data, error } = await sb.from('manual_expenses').insert(body).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const { error } = await sb.from('manual_expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
