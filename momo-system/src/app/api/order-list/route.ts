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

// Fixed-stock items at Newport — min qty to maintain, reorder when below this
// Cleaning supplies: 2 per location × 3 locations = 6 total Newport min
const FIXED_STOCK: Record<string, number> = {
  'BOUL':  192,  // 6 bottles × 32 oz (2 per location × 3)
  'COIL':  105,  // 3 containers × 35 lbs (1 per location × 3)
  'SALT':  96,   // 6 bottles × 16 oz (2 per location × 3)
  'DISH':  6,   // Dishwashing Soap — 2 per location × 3
  'CLORX': 6,   // Sanitizer — 2 per location × 3
  'SPON':  6,   // Sponges/Scrubs — 2 per location × 3
  'WFOIL': 3,   // Plastic Film — 1 per location × 3
  'GLOVE': 3,   // Gloves — 1 case per location × 3
  'PTOW':  6,   // Paper Towels — 2 per location × 3
  'TRASH': 3,   // Trash Bags — 1 per location × 3
  'TWLS':  6,   // Towels — 2 per location × 3
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

  // Inject fixed-stock items
  for (const [code, minQty] of Object.entries(FIXED_STOCK)) {
    needs[code] = minQty
  }

  // ST items: 1 case per truck that has ≤ 0.5 remaining
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

  // Newport inventory
  const { data: invData } = await sb.from('newport_inventory')
    .select('quantity_on_hand, ingredients(code)')

  const inventoryMap: Record<string,number> = {}
  for (const row of invData||[]) {
    const code = (row.ingredients as any)?.code
    if (code) inventoryMap[code] = Number(row.quantity_on_hand)
  }
  for (const code of ST_PACKAGES) inventoryMap[code] = 0

  // Ingredient metadata
  const { data: ingData } = await sb.from('ingredients')
    .select('id,code,name,category,recipe_unit,conv_factor,min_order_qty,vendor_unit_desc,is_overhead,current_unit_cost,cost_per_recipe_unit')
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
  return NextResponse.json({ lines, ingredients: ingData, orders })
}
