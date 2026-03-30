import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
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
    // Newport: combine all food truck locations using each location's own week_start_day
    const { data: locs } = await sb.from('locations')
      .select('id, week_start_day')
      .eq('type','food_truck').eq('active',true)

    const dayOffset: Record<string,number> = {
      wednesday:0, thursday:1, friday:2,
      saturday:3, sunday:4, monday:5, tuesday:6
    }

    const allOrders = await Promise.all((locs||[]).map(l => {
      // weekStart is always a Wednesday — offset forward for each location
      const offset = dayOffset[l.week_start_day ?? 'wednesday'] ?? 0
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(d.getDate() + offset)
      const locWeekStart = d.toISOString().split('T')[0]
      return getWeeklyOrders(l.id, locWeekStart)
    }))

    for (const o of allOrders) {
      orders.REG += o.REG; orders.FRI += o.FRI; orders.CHI += o.CHI
      orders.JHO += o.JHO; orders.CW += o.CW
    }  } else if (locationId) {
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
      convFactor: Number(ing.conv_factor)?? 0,
      minOrderQty: Number(ing.min_order_qty)?? 0
    }
  }

  const lines = calcOrderLines(needs, inventoryMap, meta)
  return NextResponse.json({ lines, ingredients: ingData, orders })
}
