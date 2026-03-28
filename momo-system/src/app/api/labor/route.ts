import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  let query = sb.from('manual_expenses').select('*').eq('category', '__labor_wages__')
  if (startDate) query = query.gte('expense_date', startDate)
  if (endDate) query = query.lte('expense_date', endDate)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const { startDate, endDate, totalWages, source, details } = await req.json()
  await sb.from('manual_expenses').delete()
    .eq('category', '__labor_wages__')
    .gte('expense_date', startDate)
    .lte('expense_date', endDate)
  const { data, error } = await sb.from('manual_expenses').insert({
    category: '__labor_wages__',
    amount: totalWages,
    expense_date: startDate,
    notes: JSON.stringify({ endDate, source, details })
  }).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
