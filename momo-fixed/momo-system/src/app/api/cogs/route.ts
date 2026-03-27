import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getConfig, getRecipeMap, getWeeklyOrders } from '@/lib/supabase'
import { calcCOGS } from '@/lib/calculations'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)

  // Return historical COGS if ?history=true
  if (searchParams.get('history') === 'true') {
    const { data, error } = await sb.from('package_cogs')
      .select('*').order('computed_at', { ascending: false }).limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const locationId = searchParams.get('location_id')
  const weekStart = searchParams.get('week_start')
  if (!locationId || !weekStart)
    return NextResponse.json({ error: 'location_id and week_start required' }, { status: 400 })

  const [cfg, recipeMap, orders] = await Promise.all([
    getConfig(), getRecipeMap(), getWeeklyOrders(locationId, weekStart)
  ])

  const { data: ingData } = await sb.from('ingredients')
    .select('code,name,recipe_unit,cost_per_recipe_unit')
  const costMap: Record<string,number> = {}
  const metaMap: Record<string,{name:string;unit:string}> = {}
  for (const ing of ingData||[]) {
    costMap[ing.code] = Number(ing.cost_per_recipe_unit)||0
    metaMap[ing.code] = { name: ing.name, unit: ing.recipe_unit }
  }

  const cogs = calcCOGS(orders, cfg, recipeMap, costMap, metaMap)

  await sb.from('package_cogs').insert(
    cogs.map(c => ({
      context: c.context, label: c.label,
      total_cost: c.totalCost,
      cost_per_order: c.costPerOrder,
      cost_per_batch: c.costPerBatch,
      breakdown: c.ingredients
    }))
  )

  return NextResponse.json({ cogs, orders })
}
