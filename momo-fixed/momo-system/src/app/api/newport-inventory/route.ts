import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient()
    const body = await req.json()
    const items = Array.isArray(body) ? body : [body]

    // Update one by one to avoid bulk upsert issues
    for (const item of items) {
      const { error } = await sb
        .from('newport_inventory')
        .update({ quantity_on_hand: item.quantity_on_hand })
        .eq('ingredient_id', item.ingredient_id)
      if (error) return NextResponse.json({ error: error.message, item }, { status: 500 })
    }

    return NextResponse.json({ success: true, updated: items.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
