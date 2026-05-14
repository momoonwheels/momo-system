import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

// GET /api/cogs-summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
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
    .from('receipt_line_items')
    .select('total_price, receipts!inner(receipt_date, status)')
    .eq('status', 'confirmed')
    .gte('receipts.receipt_date', start)
    .lte('receipts.receipt_date', end)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const total = (data || []).reduce((s, r: any) => s + (Number(r.total_price) || 0), 0)
  return NextResponse.json({ total })
}
