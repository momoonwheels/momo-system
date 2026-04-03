import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient, getConfig } from '@/lib/supabase'
import { calcPackageNeeds, calcPackagesToSend } from '@/lib/calculations'

const ST_PACKAGES = [
  'ST-1-BOWLS','ST-1-ALUM','ST-2-CUPS','ST-2-LIDS',
  'ST-3-FORKS','ST-4-SPOONS','ST-4-JHOL','ST-BAGS',
  'ST-NAP','ST-5-JLID','ST-6-GLOVE','ST-7-FILM',
]

// Packages whose send qty is driven by reorder rules (threshold-based),
// NOT by order volume. Remove them from calcPackageNeeds output so they
// don't block the reorder-rules loop via calcHandled.
const REORDER_RULE_OVERRIDE = [
  'CH-4',                                                  // MSG Shaker
  'NA_SA-3-RA','NA_SA-2-RA','NA_SA-1-RA','NA-4','NA-5',  // Regular Achar
  'NA_SA-3-SA','NA_SA-2-SA','NA_SA-1-SA','SA-4',          // Spicy Achar
]

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const weekStart  = searchParams.get('week_start')
  if (!locationId || !weekStart)
    return NextResponse.json({ error: 'location_id and week_start required' }, { status: 400 })

  const cfg = await getConfig()

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

  // Remove reorder-rule-driven packages from food calc output
  for (const code of REORDER_RULE_OVERRIDE) {
    delete needed[code]
  }

  // ── Truck inventory (log-based view) ─────────────────────────────────────
  const { data: truckData } = await sb
    .from('truck_inventory_current')
    .select('*')
    .eq('location_id', locationId)

  const onTruck: Record<string,number>         = {}
  const onTruckDelivery: Record<string,number> = {}
  const totalOnTruck: Record<string,number>    = {}
  for (const row of truckData||[]) {
    const code = row.code
    if (code) {
      const onHand = Number(row.current_on_hand) || 0
      onTruck[code]         = onHand
      onTruckDelivery[code] = 0
      totalOnTruck[code]    = onHand
    }
  }

  const toSend = calcPackagesToSend(needed, totalOnTruck)

  // ST items: send 1 when truck has ≤ 0.5 remaining
  for (const code of ST_PACKAGES) {
    const onHand = totalOnTruck[code] ?? 0
    toSend[code] = onHand <= 0.5 ? 1 : 0
    needed[code] = toSend[code]
  }

  // ── Reorder-rule-driven packages (CL, RA, SA, CH-4, and any future) ──────
  // Two-step lookup avoids Supabase nested-select FK naming issues.
  const calcHandled = new Set([...Object.keys(needed), ...ST_PACKAGES])

  const { data: allPkgs } = await sb.from('packages').select('id, code')
  const pkgCodeMap: Record<string, string> = {}
  for (const p of allPkgs ?? []) pkgCodeMap[p.id] = p.code

  const { data: reorderRules } = await sb
    .from('package_reorder_rules')
    .select('package_id, restock_threshold, restock_qty')
    .eq('location_id', locationId)
    .eq('active', true)

  const reorderRuleCodes: string[] = []

  for (const rule of reorderRules ?? []) {
    const code = pkgCodeMap[rule.package_id]
    if (!code || calcHandled.has(code)) continue
    const onHand    = totalOnTruck[code] ?? 0
    const threshold = Number(rule.restock_threshold)
    const sendQty   = onHand <= threshold ? Number(rule.restock_qty) : 0
    toSend[code] = sendQty
    needed[code] = sendQty
    reorderRuleCodes.push(code)
  }

  const { data: packages } = await sb.from('packages')
    .select('code,name,contents,size_qty,size_unit,containers(code,name)').order('sort_order')

  const response = NextResponse.json({
    needed, onTruck, onTruckDelivery, totalOnTruck,
    toSend, packages, orders, weekOrders, cfg,
    reorderRuleCodes,
  })
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  return response
}
