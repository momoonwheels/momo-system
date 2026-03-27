import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getConfig, getRecipeMap, getWeeklyOrders } from '@/lib/supabase'
import { calcIngredientNeeds, calcOrderLines } from '@/lib/calculations'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const weekStart = searchParams.get('week_start')
  if (!locationId || !weekStart)
    return NextResponse.json({ error: 'location_id and week_start required' }, { status: 400 })

  const [cfg, recipeMap, orders] = await Promise.all([
    getConfig(), getRecipeMap(), getWeeklyOrders(locationId, weekStart)
  ])
  const needs = calcIngredientNeeds(orders, cfg, recipeMap)

  const { data: invData } = await sb.from('newport_inventory')
    .select('quantity_on_hand, ingredients(code)')
  const inventoryMap: Record<string,number> = {}
  for (const row of invData||[]) {
    const code = (row.ingredients as any)?.code
    if (code) inventoryMap[code] = Number(row.quantity_on_hand)
  }

  const { data: ingData } = await sb.from('ingredients')
    .select('code,name,category,recipe_unit,conv_factor,min_order_qty,vendor_unit_desc,is_overhead,current_unit_cost,cost_per_recipe_unit')
    .order('sort_order')
  const meta: Record<string,any> = {}
  for (const ing of ingData||[]) meta[ing.code] = ing

  const lines = calcOrderLines(needs, inventoryMap, meta)
  return NextResponse.json({ lines, ingredients: ingData, orders })
}