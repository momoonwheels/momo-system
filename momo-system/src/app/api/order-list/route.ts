import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient, getConfig, getRecipeMap, getWeeklyOrders } from '@/lib/supabase'
import { calcIngredientNeeds, calcOrderLines } from '@/lib/calculations'

// Map of truck packages → the ingredient Newport actually orders for each.
// When a truck runs low on a package (e.g. ST-1-BOWLS), we bump the need for
// the corresponding ingredient (MOB) on Newport's vendor order list.
//
// The order list never shows "ST-xxx" rows — only ingredients. The truck's
// package inventory just tells us which ingredients need restocking.
const PACKAGE_TO_INGREDIENT: Record<string, string> = {
  'ST-1-BOWLS':  'MOB',    // Momo Bowls
  'ST-1-ALUM':   'ALUM',   // Aluminum Foil
  'ST-2-CUPS':   'CUP',    // 2oz Sauce Cups
  'ST-2-LIDS':   'LID',    // 2oz Sauce Lids
  'ST-3-FORKS':  'FORK',   // Forks
  'ST-4-SPOONS': 'SPOON',  // Spoons
  'ST-4-JHOL':   'JHBWL',  // Jhol Bowls
  'ST-5-JLID':   'JHBLD',  // Jhol Bowl Lids
  'ST-BAGS':     'BAG',    // Brown Bags
  'ST-NAP':      'NAP',    // Napkins
  'ST-6-GLOVE':  'GLOVE',  // Vinyl Gloves
  // ST-7-FILM (Plastic Film) has no corresponding ingredient yet — add one if you want it tracked
}

const FIXED_STOCK: Record<string, number> = {
  'BOUL':  192,
  'COIL':  105,
  'SALT':  96,
  'DISH':  6,
  'CLORX': 6,
  'SPON':  6,
  'WFOIL': 3,
  'GLOVE': 3,
  'PTOW':  6,
  'TRASH': 3,
  'TWLS':  6,
}

const PIECES_PER_BATCH   = 440
const WEEKLY_MOMO_TARGET = 4400
const TARGET_BATCHES     = WEEKLY_MOMO_TARGET / PIECES_PER_BATCH  // 10
const MOMOS_PER_PLATE    = 10

// For every ingredient, find the most recent unit_price from receipt_line_items.
// Falls back to ingredients.current_unit_cost (manual entry) if no matched receipt.
async function buildPriceMap(
  sb: ReturnType<typeof createServerClient>,
  ingredients: Array<{ id: string; code: string; name: string; current_unit_cost: number | null }>
) {
  const { data: rli, error } = await sb
    .from('receipt_line_items')
    .select('matched_ingredient_id, unit_price, created_at, receipts(receipt_date)')
    .not('matched_ingredient_id', 'is', null)
    .not('unit_price', 'is', null)
    .order('created_at', { ascending: false })

  if (error) console.error('buildPriceMap: receipt_line_items query failed', error)

  const latestByIngredient: Record<string, { unit_price: number; receipt_date?: string }> = {}
  for (const row of rli || []) {
    const ingId = row.matched_ingredient_id as string
    if (!ingId || latestByIngredient[ingId]) continue
    const price = Number(row.unit_price)
    if (isNaN(price) || price <= 0) continue
    latestByIngredient[ingId] = {
      unit_price:   price,
      receipt_date: (row.receipts as any)?.receipt_date,
    }
  }

  const priceMap: Record<string, { unit_price: number; source: 'receipt' | 'manual'; last_receipt_date?: string }> = {}
  for (const ing of ingredients) {
    const fromReceipt = latestByIngredient[ing.id]
    if (fromReceipt) {
      priceMap[ing.code] = {
        unit_price:        fromReceipt.unit_price,
        source:            'receipt',
        last_receipt_date: fromReceipt.receipt_date,
      }
    } else if (ing.current_unit_cost != null && Number(ing.current_unit_cost) > 0) {
      priceMap[ing.code] = {
        unit_price: Number(ing.current_unit_cost),
        source:     'manual',
      }
    }
  }

  return priceMap
}

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const weekStart  = searchParams.get('week_start')
  const combined   = searchParams.get('combined') === 'true'

  if (!weekStart)
    return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  let orders = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }

  if (combined) {
    const { data: locs } = await sb.from('locations')
      .select('id, week_start_day')
      .eq('type','food_truck').eq('active',true)

    const dayOffset: Record<string,number> = {
      wednesday:0, thursday:1, friday:2,
      saturday:3, sunday:4, monday:5, tuesday:6
    }

    const allOrders = await Promise.all((locs||[]).map(l => {
      const offset = dayOffset[l.week_start_day ?? 'wednesday'] ?? 0
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(d.getDate() + offset)
      const locWeekStart = d.toISOString().split('T')[0]
      return getWeeklyOrders(l.id, locWeekStart)
    }))

    for (const o of allOrders) {
      orders.REG += o.REG; orders.FRI += o.FRI; orders.CHI += o.CHI
      orders.JHO += o.JHO; orders.CW += o.CW
    }
  } else if (locationId) {
    orders = await getWeeklyOrders(locationId, weekStart)
  }

  const [cfg, recipeMap] = await Promise.all([getConfig(), getRecipeMap()])
  const needs = calcIngredientNeeds(orders, cfg, recipeMap)

  // ── Summer Ramp Up ───────────────────────────────────────────────────────────
  const summerRampUp    = Number(cfg['SUMMER_RAMP_UP'] ?? 0) === 1
  const forecastMomos   = (orders.REG + orders.FRI + orders.CHI + orders.JHO) * MOMOS_PER_PLATE
  const forecastBatches = forecastMomos / PIECES_PER_BATCH
  const extraBatches    = TARGET_BATCHES - forecastBatches

  if (summerRampUp && extraBatches > 0) {
    const { data: batchFmRows } = await sb
      .from('recipe_items')
      .select('qty, ingredients(code)')
      .eq('context', 'BATCH_FM')

    for (const row of batchFmRows || []) {
      const code = (row.ingredients as any)?.code
      if (!code) continue
      needs[code] = (needs[code] ?? 0) + extraBatches * Number(row.qty)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Always-order items
  for (const [code, minQty] of Object.entries(FIXED_STOCK)) {
    needs[code] = minQty
  }

  // ── Truck-low trigger: when a truck package runs low, bump the matching
  //    ingredient's need on Newport's order list. The order list never shows
  //    ST-codes — only ingredients, which is what Newport actually buys.
  const { data: allTruckData } = await sb
    .from('truck_inventory')
    .select('quantity, delivery_received, packages!inner(code)')

  for (const row of allTruckData || []) {
    const pkgCode = (row.packages as any)?.code
    const ingCode = PACKAGE_TO_INGREDIENT[pkgCode]
    if (!ingCode) continue  // package isn't mapped to an ingredient, skip
    const total = (Number(row.quantity) || 0) + (Number(row.delivery_received) || 0)
    if (total <= 0.5) {
      needs[ingCode] = (needs[ingCode] ?? 0) + 1
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const { data: invData } = await sb.from('newport_inventory')
    .select('quantity_on_hand, ingredients(code)')

  const inventoryMap: Record<string,number> = {}
  for (const row of invData||[]) {
    const code = (row.ingredients as any)?.code
    if (code) inventoryMap[code] = Number(row.quantity_on_hand)
  }

  const { data: ingData } = await sb.from('ingredients')
    .select('id,code,name,category,recipe_unit,conv_factor,min_order_qty,vendor_unit_desc,is_overhead,current_unit_cost,cost_per_recipe_unit,sort_order')
    .order('sort_order')

  const meta: Record<string,{convFactor:number;minOrderQty:number}> = {}
  for (const ing of ingData||[]) {
    meta[ing.code] = {
      convFactor:  Number(ing.conv_factor)  ?? 0,
      minOrderQty: Number(ing.min_order_qty) ?? 0,
    }
  }

  const lines = calcOrderLines(needs, inventoryMap, meta)
  const priceMap = await buildPriceMap(sb, ingData || [])

  return NextResponse.json({
    lines,
    ingredients: ingData,
    priceMap,
    orders,
    summerRampUp,
  })
}
