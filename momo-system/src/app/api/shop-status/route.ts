import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

// GET /api/shop-status?week_start=YYYY-MM-DD
// → { status: { CODE: 'full' | 'partial', ... } }
export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('week_start')
  if (!weekStart) {
    return NextResponse.json({ error: 'week_start required' }, { status: 400 })
  }

  const { data, error } = await sb
    .from('order_shop_status')
    .select('ingredient_code, status')
    .eq('week_start', weekStart)

  if (error) {
    console.error('shop-status GET failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const status: Record<string, 'full' | 'partial'> = {}
  for (const row of data || []) {
    status[row.ingredient_code] = row.status as 'full' | 'partial'
  }
  return NextResponse.json({ status })
}

// PUT /api/shop-status
// body: { week_start, ingredient_code, status }
// status may be 'full' | 'partial' | null  (null clears the row)
export async function PUT(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const { week_start, ingredient_code, status } = body
  if (!week_start || !ingredient_code) {
    return NextResponse.json({ error: 'week_start and ingredient_code required' }, { status: 400 })
  }

  // Clear → delete the row
  if (status === null || status === undefined) {
    const { error } = await sb
      .from('order_shop_status')
      .delete()
      .eq('week_start', week_start)
      .eq('ingredient_code', ingredient_code)
    if (error) {
      console.error('shop-status DELETE failed', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, cleared: true })
  }

  if (status !== 'full' && status !== 'partial') {
    return NextResponse.json({ error: "status must be 'full', 'partial', or null" }, { status: 400 })
  }

  // Upsert by (week_start, ingredient_code)
  const { error } = await sb
    .from('order_shop_status')
    .upsert(
      { week_start, ingredient_code, status, updated_at: new Date().toISOString() },
      { onConflict: 'week_start,ingredient_code' }
    )

  if (error) {
    console.error('shop-status UPSERT failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
