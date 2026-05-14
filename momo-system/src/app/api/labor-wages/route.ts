import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

// GET /api/labor-wages?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
// → { total: number }
export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start_date')
  const end = searchParams.get('end_date')
  if (!start || !end) {
    return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 })
  }
  const { data, error } = await sb
    .from('manual_expenses')
    .select('amount')
    .eq('category', '__labor_wages__')
    .gte('expense_date', start)
    .lte('expense_date', end)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const total = (data || []).reduce((s, r: any) => s + (Number(r.amount) || 0), 0)
  return NextResponse.json({ total })
}

// PUT /api/labor-wages
// body: { start_date, end_date, amount }
// Replaces any existing wage rows in the date range with a single row.
export async function PUT(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const { start_date, end_date, amount } = body
  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 })
  }
  const numeric = Number(amount)
  if (isNaN(numeric) || numeric < 0) {
    return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 })
  }
  // Replace existing wage rows for this period
  const { error: delErr } = await sb
    .from('manual_expenses')
    .delete()
    .eq('category', '__labor_wages__')
    .gte('expense_date', start_date)
    .lte('expense_date', end_date)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const { error: insErr } = await sb
    .from('manual_expenses')
    .insert({
      category: '__labor_wages__',
      amount: numeric,
      expense_date: start_date,
      notes: `Labor wages ${start_date} to ${end_date}`,
    })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, total: numeric })
}
