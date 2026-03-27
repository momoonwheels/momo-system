import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const sb = createServerClient()
  const { data, error } = await sb.from('ingredients')
    .select('*, newport_inventory(quantity_on_hand)').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const { id, inventory_qty, ...updates } = body
  const [ingResult] = await Promise.all([
    sb.from('ingredients').update(updates).eq('id', id).select(),
    inventory_qty !== undefined
      ? sb.from('newport_inventory').upsert({ ingredient_id: id, quantity_on_hand: inventory_qty }, { onConflict: 'ingredient_id' })
      : Promise.resolve()
  ])
  if (ingResult.error) return NextResponse.json({ error: ingResult.error.message }, { status: 500 })
  return NextResponse.json(ingResult.data)
}