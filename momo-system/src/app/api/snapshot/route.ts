import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const sb = createServerClient()

  // Run all queries in parallel
  const [
    { data: config },
    { data: ingredients },
    { data: recipeItems },
    { data: packages },
    { data: containers },
    { data: menuItems },
    { data: locations },
    { data: plannedOrders },
    { data: newportInventory },
    { data: truckInventory },
    { data: deliverySchedule },
  ] = await Promise.all([
    sb.from('config').select('*').order('group_name').order('sort_order'),
    sb.from('ingredients').select('*').order('sort_order'),
    sb.from('recipe_items').select('*, ingredients(code,name)'),
    sb.from('packages').select('*, containers(code,name)').order('sort_order'),
    sb.from('containers').select('*').order('sort_order'),
    sb.from('menu_items').select('*').order('sort_order'),
    sb.from('locations').select('*').order('name'),
    sb.from('planned_orders')
      .select('*, menu_items(code,name), locations(name)')
      .gte('week_start', new Date(Date.now() - 28*24*60*60*1000).toISOString().split('T')[0])
      .order('week_start', { ascending: false }),
    sb.from('newport_inventory').select('*, ingredients(code,name)'),
    sb.from('truck_inventory').select('*, packages(code,name), locations(name)'),
    sb.from('delivery_schedule').select('*, locations(name)'),
  ])

  const snapshot = {
    _meta: {
      type: 'momo_system_snapshot',
      version: '1.0',
      generated_at: new Date().toISOString(),
      description: 'Full system snapshot for Momo on the Wheels operations system',
    },
    system: {
      config: config ?? [],
      ingredients: ingredients ?? [],
      recipe_matrix: recipeItems ?? [],
      packages: packages ?? [],
      containers: containers ?? [],
      menu_items: menuItems ?? [],
      locations: locations ?? [],
      delivery_schedule: deliverySchedule ?? [],
    },
    current_data: {
      planned_orders_last_4_weeks: plannedOrders ?? [],
      newport_inventory: newportInventory ?? [],
      truck_inventory: truckInventory ?? [],
    },
  }

  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="momo_snapshot_${new Date().toISOString().split('T')[0]}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
