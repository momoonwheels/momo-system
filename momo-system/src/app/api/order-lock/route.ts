import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Given any date, return Monday and Sunday of that calendar week
function calendarWeekWindow(weekStart: string): { monday: string; sunday: string } {
  const d = new Date(weekStart + 'T12:00:00')
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(d)
  monday.setDate(d.getDate() - daysToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    monday: monday.toISOString().split('T')[0],
    sunday: sunday.toISOString().split('T')[0],
  }
}

// GET: fetch lock + reconciliation for a week
export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('week_start')
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  const { data: lock } = await sb
    .from('order_lock')
    .select('*, order_lock_items(*)')
    .eq('week_start', weekStart)
    .single()

  if (!lock) return NextResponse.json({ locked: false })

  // Receipts window = Monday–Sunday of the calendar week containing week_start
  // e.g. week_start Wed Apr 1 → Mon Mar 30 to Sun Apr 5
  // Buying happens Mon–Tue before the service week, captured in this window
  const { monday, sunday } = calendarWeekWindow(weekStart)

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
    .gte('receipts.receipt_date', monday)
    .lte('receipts.receipt_date', sunday)
    .not('matched_ingredient_id', 'is', null)

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
    items:          lock.order_lock_items,
    actual:         actualByCode,
    receipt_window: { monday, sunday },
  })
}

// POST: lock the order
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

// PATCH: update notes
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
