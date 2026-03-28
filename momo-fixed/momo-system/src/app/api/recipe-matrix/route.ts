import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const sb = createServerClient()
  const { data, error } = await sb.from('recipe_items')
    .select('*, ingredients(id,code,name,category,recipe_unit,sort_order)')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const sorted = (data||[]).sort((a,b) => {
    const aOrder = (a.ingredients as any)?.sort_order || 0
    const bOrder = (b.ingredients as any)?.sort_order || 0
    return aOrder - bOrder
  })
  return NextResponse.json(sorted)
}

export async function PUT(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const items = Array.isArray(body) ? body : [body]
  const { data, error } = await sb.from('recipe_items')
    .upsert(items, { onConflict: 'ingredient_id,context' }).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  return PUT(req)
}
