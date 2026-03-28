import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient, getConfig, getWeeklyOrders } from '@/lib/supabase'
import { calcPackageNeeds, calcPackagesToSend } from '@/lib/calculations'

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  const weekStart = searchParams.get('week_start')
  if (!locationId || !weekStart)
    return NextResponse.json({ error: 'location_id and week_start required' }, { status: 400 })

  const [cfg, orders] = await Promise.all([getConfig(), getWeeklyOrders(locationId, weekStart)])
  const needed = calcPackageNeeds(orders, cfg)

  // Direct SQL query to avoid any ORM caching
  const { data: truckData, error } = await sb
    .from('truck_inventory')
    .select('quantity, package_id, packages!inner(code)')
    .eq('location_id', locationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const onTruck: Record<string,number> = {}
  for (const row of truckData||[]) {
    const code = (row.packages as any)?.code
    if (code) onTruck[code] = Number(row.quantity)
  }

  const toSend = calcPackagesToSend(needed, onTruck)
  const { data: packages } = await sb.from('packages')
    .select('code,name,contents,size_qty,size_unit,containers(code,name)').order('sort_order')

  // Add debug info temporarily
  const response = NextResponse.json({ needed, onTruck, toSend, packages, orders, debug: { truckRows: truckData?.length, fm1Raw: truckData?.find((r:any) => r.packages?.code === 'FM-1') } })
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  return response
}
