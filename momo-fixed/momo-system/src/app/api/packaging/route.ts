import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient, getConfig } from '@/lib/supabase'
import { calcPackageNeeds, calcPackagesToSend } from '@/lib/calculations'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const weekStart = searchParams.get('week_start')
  if (!locationId || !weekStart)
    return NextResponse.json({ error: 'location_id and week_start required' }, { status: 400 })

  const cfg = await getConfig()

  // Get planned orders with per-day breakdown
  const { data: ordersData } = await sb.from('planned_orders')
    .select('*, menu_items(code)')
    .eq('location_id', locationId)
    .eq('week_start', weekStart)

  const orders = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
  const weekOrders: Record<string, Record<string, number>> = {}
  const days = ['mon','tue','wed','thu','fri','sat','sun']

  for (const row of ordersData||[]) {
    const code = (row.menu_items as any)?.code
    if (!code) continue
    weekOrders[code] = {}
    for (const day of days) weekOrders[code][day] = Number(row[day])||0
    orders[code as keyof typeof orders] = days.reduce((sum, d) => sum + (Number(row[d])||0), 0)
  }

  const needed = calcPackageNeeds(orders, cfg)

  // Get truck inventory
  const { data: truckData } = await sb
    .from('truck_inventory')
    .select('quantity, delivery_received, packages!inner(code)')
    .eq('location_id', locationId)

  const onTruck: Record<string,number> = {}
  const onTruckDelivery: Record<string,number> = {}
  const totalOnTruck: Record<string,number> = {}

  for (const row of truckData||[]) {
    const code = (row.packages as any)?.code
    if (code) {
      onTruck[code] = Number(row.quantity)||0
      onTruckDelivery[code] = Number(row.delivery_received)||0
      totalOnTruck[code] = onTruck[code] + onTruckDelivery[code]
    }
  }

  const toSend = calcPackagesToSend(needed, totalOnTruck)

  const { data: packages } = await sb.from('packages')
    .select('code,name,contents,size_qty,size_unit,containers(code,name)').order('sort_order')

  const response = NextResponse.json({
    needed, onTruck, onTruckDelivery, totalOnTruck,
    toSend, packages, orders, weekOrders, cfg
  })
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  return response
}
