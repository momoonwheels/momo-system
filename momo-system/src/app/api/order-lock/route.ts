import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET: fetch lock + reconciliation for a week
export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('week_start')
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  // Get lock with items
  const { data: lock } = await sb
    .from('order_lock')
    .select('*, order_lock_items(*)')
    .eq('week_start', weekStart)
    .single()

  if (!lock) return NextResponse.json({ locked: false })

  // FIX 1: Look 14 days BEFORE week start through 7 days AFTER
  // Receipts arrive before the week starts (you buy ingredients in advance)
  const windowStart = new Date(weekStart + 'T12:00:00')
  windowStart.setDate(windowStart.getDate() - 14)
  const windowEnd = new Date(weekStart + 'T12:00:00')
  windowEnd.setDate(windowEnd.getDate() + 7)
  const windowStartStr = windowStart.toISOString().split('T')[0]
  const windowEndStr   = windowEnd.toISOString().split('T')[0]

  // FIX 2: use matched_ingredient_id (not ingredient_id)
  const { data: receiptLines } = await sb
    .from('receipt_line_items')
    .select(`
      total_price,
      quantity,
      unit,
      raw_text,
      status,
      matched_ingredient_id,
      receipts!inner(receipt_date, vendor_name, status),
      ingredients!matched_ingredient_id(code, name)
    `)
    .eq('status', 'confirmed')
    .gte('receipts.receipt_date', windowStartStr)
    .lte('receipts.receipt_date', windowEndStr)
    .not('matched_ingredient_id', 'is', null)

  // Sum actual qty by ingredient code
  const actualByCode: Record<string, { qty: number; cost: number; lines: any[] }> = {}
  for (const line of receiptLines || []) {
    const code = (line.ingredients as any)?.code
    if (!code) continue
    if (!actualByCode[code]) actualByCode[code] = { qty: 0, cost: 0, lines: [] }
    actualByCode[code].qty  += Number(line.quantity)    || 0
    actualByCode[code].cost += Number(line.total_price) || 0
    actualByCode[code].lines.push({
      raw_text: line.raw_text,
      qty:      line.quantity,
      unit:     line.unit,
      vendor:   (line.receipts as any)?.vendor_name,
      date:     (line.receipts as any)?.receipt_date,
    })
  }

  return NextResponse.json({
    locked: true,
    lock: {
      id:            lock.id,
      week_start:    lock.week_start,
      locked_at:     lock.locked_at,
      locked_by:     lock.locked_by,
      overall_notes: lock.overall_notes,
    },
    items:  lock.order_lock_items,
    actual: actualByCode,
  })
}

// POST: lock the order (save snapshot)
export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const { week_start, items } = body

  if (!week_start || !items?.length)
    return NextResponse.json({ error: 'week_start and items required' }, { status: 400 })

  const { data: lock, error: lockErr } = await sb
    .from('order_lock')
    .upsert({ week_start }, { onConflict: 'week_start' })
    .select()
    .single()

  if (lockErr) return NextResponse.json({ error: lockErr.message }, { status: 500 })

  await sb.from('order_lock_items').delete().eq('lock_id', lock.id)

  const lockItems = items.map((item: any) => ({
    lock_id:                lock.id,
    ingredient_code:        item.ingredient_code,
    ingredient_name:        item.ingredient_name,
    category:               item.category               || '',
    recipe_unit:            item.recipe_unit            || '',
    vendor_unit_desc:       item.vendor_unit_desc       || '',
    conv_factor:            item.conv_factor            || 1,
    recommended_recipe_qty: item.recommended_recipe_qty || 0,
    recommended_vendor_qty: item.recommended_vendor_qty || 0,
  }))

  const { error: itemsErr } = await sb.from('order_lock_items').insert(lockItems)
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, lock_id: lock.id, items_saved: lockItems.length })
}

// PATCH: update manager notes
export async function PATCH(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()

  if (body.type === 'overall') {
    const { lock_id, overall_notes } = body
    const { error } = await sb.from('order_lock').update({ overall_notes }).eq('id', lock_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { item_id, manager_notes } = body
    const { error } = await sb.from('order_lock_items').update({ manager_notes }).eq('id', item_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
