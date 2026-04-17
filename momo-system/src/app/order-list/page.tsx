import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// PATCH /api/unit-price
// Body: { code: string, current_unit_cost: number | null }
//
// Sets the manual fallback price on an ingredient. This is used when there's
// no matching receipt line yet. The receipts module, once it reconciles a
// receipt matched to this ingredient, will supply the price from receipts
// instead (which takes precedence in /api/order-list's priceMap).
//
// Pass null or empty string to clear a manually-entered price.
export async function PATCH(req: NextRequest) {
  const sb = createServerClient()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const code = String(body?.code || '').trim()
  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 })
  }

  let cost: number | null = null
  if (body?.current_unit_cost !== null &&
      body?.current_unit_cost !== undefined &&
      body?.current_unit_cost !== '') {
    const parsed = Number(body.current_unit_cost)
    if (isNaN(parsed) || parsed < 0) {
      return NextResponse.json({ error: 'current_unit_cost must be a non-negative number' }, { status: 400 })
    }
    cost = parsed
  }

  const { data: ingMatch } = await sb
    .from('ingredients')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  if (!ingMatch) {
    return NextResponse.json({ error: `Ingredient '${code}' not found` }, { status: 404 })
  }

  const { error } = await sb
    .from('ingredients')
    .update({ current_unit_cost: cost })
    .eq('id', ingMatch.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, code, current_unit_cost: cost })
}

// GET /api/unit-price
// Returns all ingredients with current price info for the admin page.
// For each ingredient, includes both the receipt-derived price (if any)
// and the manual fallback, so the admin page can show the effective price
// and its source.
export async function GET() {
  const sb = createServerClient()

  const [{ data: ings }, { data: rli }] = await Promise.all([
    sb.from('ingredients')
      .select('id, code, name, category, vendor_unit_desc, current_unit_cost, updated_at, active, sort_order')
      .eq('active', true)
      .order('sort_order'),
    sb.from('receipt_line_items')
      .select('matched_ingredient_id, unit_price, created_at, receipts(receipt_date, vendor_name)')
      .not('matched_ingredient_id', 'is', null)
      .not('unit_price', 'is', null)
      .order('created_at', { ascending: false }),
  ])

  // Newest non-null unit_price per ingredient_id
  const latestByIng: Record<string, { unit_price: number; receipt_date?: string; vendor_name?: string }> = {}
  for (const row of rli || []) {
    const ingId = row.matched_ingredient_id as string
    if (!ingId || latestByIng[ingId]) continue
    const p = Number(row.unit_price)
    if (isNaN(p) || p <= 0) continue
    latestByIng[ingId] = {
      unit_price:   p,
      receipt_date: (row.receipts as any)?.receipt_date,
      vendor_name:  (row.receipts as any)?.vendor_name,
    }
  }

  const rows = (ings || []).map((i: any) => {
    const fromReceipt = latestByIng[i.id]
    const manualPrice = i.current_unit_cost != null ? Number(i.current_unit_cost) : null
    return {
      id:                i.id,
      code:              i.code,
      name:              i.name,
      category:          i.category,
      vendor_unit_desc:  i.vendor_unit_desc,
      // The effective price the order list will use:
      effective_price:   fromReceipt?.unit_price ?? (manualPrice && manualPrice > 0 ? manualPrice : null),
      effective_source:  fromReceipt ? 'receipt' : (manualPrice && manualPrice > 0 ? 'manual' : null),
      // Raw values so the admin page can show both:
      receipt_price:     fromReceipt?.unit_price ?? null,
      receipt_date:      fromReceipt?.receipt_date ?? null,
      receipt_vendor:    fromReceipt?.vendor_name ?? null,
      manual_price:      manualPrice,
      sort_order:        i.sort_order,
    }
  })

  return NextResponse.json({ ingredients: rows })
}
