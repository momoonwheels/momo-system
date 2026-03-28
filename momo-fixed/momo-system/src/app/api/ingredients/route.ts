import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
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
  const results: any[] = []
  if (Object.keys(updates).length > 0) {
    const r = await sb.from('ingredients').update(updates).eq('id', id).select()
    results.push(r)
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })
  }
  if (inventory_qty !== undefined) {
    const r = await sb.from('newport_inventory')
      .upsert({ ingredient_id: id, quantity_on_hand: inventory_qty }, { onConflict: 'ingredient_id' })
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest) {
  return PUT(req)
}
