import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const items = Array.isArray(body) ? body : [body]
  const { error } = await sb.from('newport_inventory')
    .upsert(items, { onConflict: 'ingredient_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
