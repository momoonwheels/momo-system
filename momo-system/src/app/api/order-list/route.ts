import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient, getConfig, getRecipeMap, getWeeklyOrders } from '@/lib/supabase'
import { calcIngredientNeeds, calcOrderLines } from '@/lib/calculations'

const ST_PACKAGES = [
  'ST-1-BOWLS','ST-1-ALUM','ST-2-CUPS','ST-2-LIDS',
  'ST-3-FORKS','ST-4-SPOONS','ST-4-JHOL','ST-BAGS',
  'ST-NAP','ST-5-JLID','ST-6-GLOVE','ST-7-FILM',
]

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
  // When ON: BATCH_FM ingredients (dough + filling) are topped up to always
  // reflect 4,400 momos (10 batches) regardless of forecast.
  // Everything else — achar, jhol, chilli sauce, chowmein — stays at forecast.
  // Toggle via SUMMER_RAMP_UP in config table (0 = off, 1 = on).
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

  for (const [code, minQty] of Object.entries(FIXED_STOCK)) {
    needs[code] = minQty
  }

  const { data: allTruckData } = await sb
    .from('truck_inventory')
    .select('quantity, delivery_received, packages!inner(code)')

  const stNeedsMap: Record<string, number> = {}
  for (const row of allTruckData || []) {
    const code = (row.packages as any)?.code
    if (!ST_PACKAGES.includes(code)) continue
    const total = (Number(row.quantity) || 0) + (Number(row.delivery_received) || 0)
    if (total <= 0.5) {
      stNeedsMap[code] = (stNeedsMap[code] ?? 0) + 1
    }
  }
  for (const code of ST_PACKAGES) {
    if ((stNeedsMap[code] ?? 0) > 0) needs[code] = stNeedsMap[code]
  }

  const { data: invData } = await sb.from('newport_inventory')
    .select('quantity_on_hand, ingredients(code)')

  const inventoryMap: Record<string,number> = {}
  for (const row of invData||[]) {
    const code = (row.ingredients as any)?.code
    if (code) inventoryMap[code] = Number(row.quantity_on_hand)
  }
  for (const code of ST_PACKAGES) inventoryMap[code] = 0

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
  for (const code of ST_PACKAGES) {
    if (!meta[code]) meta[code] = { convFactor: 1, minOrderQty: 1 }
  }

  const lines = calcOrderLines(needs, inventoryMap, meta)
  return NextResponse.json({ lines, ingredients: ingData, orders, summerRampUp })
}
