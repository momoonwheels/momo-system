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

  // Build weekly totals and per-day breakdown
  const orders = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
  const weekOrders: Record<string, Record<string, number>> = {}

  for (const row of ordersData||[]) {
    const code = (row.menu_items as any)?.code
    if (!code) continue
    const days = ['mon','tue','wed','thu','fri','sat','sun']
    weekOrders[code] = {}
    for (const day of days) {
      weekOrders[code][day] = Number(row[day])||0
    }
    orders[code as keyof typeof orders] =
      days.reduce((sum, d) => sum + (Number(row[d])||0), 0)
  }

  const needed = calcPackageNeeds(orders, cfg)

  // Get truck inventory (quantity = on hand, delivery_received = new delivery)
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

  // Per-day-group package needs
  const SCHEDULE: Record<string, { label: string; days: string[] }[]> = {
    'Lincoln City Food Truck': [
      { label: 'Wed Pack (Wed+Thu+Fri)', days: ['wed','thu','fri'] },
      { label: 'Sat Pack (Sat+Sun)',     days: ['sat','sun'] },
    ],
    'Salem Food Truck': [
      { label: 'Thu Pack (Thu+Fri+Sat)',     days: ['thu','fri','sat'] },
      { label: 'Sun Pack (Sun+Mon+Tue+Wed)', days: ['sun','mon','tue','wed'] },
    ],
  }

  // Get location name
  const { data: locData } = await sb.from('locations').select('name').eq('id', locationId).single()
  const locName = locData?.name || ''
  const schedule = SCHEDULE[locName] || []

  // Calculate needs per day group
  const dayGroupNeeds: Record<string, Record<string, number>> = {}
  for (const group of schedule) {
    const groupOrders = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
    for (const menuCode of Object.keys(weekOrders)) {
      for (const day of group.days) {
        groupOrders[menuCode as keyof typeof groupOrders] += weekOrders[menuCode]?.[day]||0
      }
    }
    dayGroupNeeds[group.label] = calcPackageNeeds(groupOrders, cfg)
  }

  // Calculate to-send per day group (subtract total on truck from first group only)
  const dayGroupToSend: Record<string, Record<string, number>> = {}
  for (let i = 0; i < schedule.length; i++) {
    const group = schedule[i]
    const groupNeeded = dayGroupNeeds[group.label]
    if (i === 0) {
      // First delivery: subtract total on truck
      dayGroupToSend[group.label] = calcPackagesToSend(groupNeeded, totalOnTruck)
    } else {
      // Subsequent deliveries: no subtraction (truck will have been emptied)
      dayGroupToSend[group.label] = { ...groupNeeded }
    }
  }

  const { data: packages } = await sb.from('packages')
    .select('code,name,contents,size_qty,size_unit,containers(code,name)').order('sort_order')

  const response = NextResponse.json({
    needed, onTruck, onTruckDelivery, totalOnTruck, toSend,
    packages, orders, weekOrders,
    dayGroupNeeds, dayGroupToSend, schedule, locationName: locName
  })
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  return response
}
