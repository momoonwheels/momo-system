import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient, getConfig, getRecipeMap, getWeeklyOrders } from '@/lib/supabase'
import { calcIngredientNeeds, calcOrderLines } from '@/lib/calculations'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const weekStart = searchParams.get('week_start')
  const combined = searchParams.get('combined') === 'true'
  if (!weekStart)
    return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  let orders = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }

  if (combined) {
    // Newport: combine all food truck locations
    const { data: locs } = await sb.from('locations').select('id').eq('type','food_truck').eq('active',true)
    const allOrders = await Promise.all((locs||[]).map(l => getWeeklyOrders(l.id, weekStart!)))
    for (const o of allOrders) {
      orders.REG += o.REG; orders.FRI += o.FRI; orders.CHI += o.CHI
      orders.JHO += o.JHO; orders.CW += o.CW
    }
  } else if (locationId) {
    orders = await getWeeklyOrders(locationId, weekStart)
  }

  const [cfg, recipeMap] = await Promise.all([getConfig(), getRecipeMap()])
  const needs = calcIngredientNeeds(orders, cfg, recipeMap)

  const { data: invData } = await sb.from('newport_inventory')
    .select('quantity_on_hand, ingredients(code)')
  const inventoryMap: Record<string,number> = {}
  for (const row of invData||[]) {
    const code = (row.ingredients as any)?.code
    if (code) inventoryMap[code] = Number(row.quantity_on_hand)
  }

  const { data: ingData } = await sb.from('ingredients')
    .select('id,code,name,category,recipe_unit,conv_factor,min_order_qty,vendor_unit_desc,is_overhead,current_unit_cost,cost_per_recipe_unit')
    .order('sort_order')
  const meta: Record<string,{convFactor:number;minOrderQty:number}> = {}
  for (const ing of ingData||[]) {
    meta[ing.code] = {
      convFactor: Number(ing.conv_factor) || 1,
      minOrderQty: Number(ing.min_order_qty) || 1
    }
  }

  const lines = calcOrderLines(needs, inventoryMap, meta)
  return NextResponse.json({ lines, ingredients: ingData, orders })
}
