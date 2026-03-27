import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const sb = createServerClient()
  const { data, error } = await sb.from('recipe_items')
    .select('*, ingredients(id,code,name,category,recipe_unit)')
    .order('ingredients(sort_order)')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const { data, error } = await sb.from('recipe_items')
    .upsert(body, { onConflict: 'ingredient_id,context' }).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}