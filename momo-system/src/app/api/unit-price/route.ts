import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// PATCH /api/unit-price
// Body: { code: string, current_unit_cost: number | null }
//
// Looks up the code in both `ingredients` and `packages` (ingredients wins
// if the code somehow exists in both) and updates current_unit_cost there.
// Pass null or empty string to clear a manually-entered price.
export async function PATCH(req: NextRequest) {
  const sb = createServerClient()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const code = String(body?.code || '').trim()
  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 })
  }

  // Accept number, numeric string, null, or empty string (clear)
  let cost: number | null = null
  if (body?.current_unit_cost !== null &&
      body?.current_unit_cost !== undefined &&
      body?.current_unit_cost !== '') {
    const parsed = Number(body.current_unit_cost)
    if (isNaN(parsed) || parsed < 0) {
      return NextResponse.json({ error: 'current_unit_cost must be a non-negative number' }, { status: 400 })
    }
    cost = parsed
  }

  // Try ingredients first
  const { data: ingMatch } = await sb
    .from('ingredients')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  if (ingMatch) {
    const { error } = await sb
      .from('ingredients')
      .update({ current_unit_cost: cost })
      .eq('id', ingMatch.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, table: 'ingredients', code, current_unit_cost: cost })
  }

  // Fall through to packages
  const { data: pkgMatch } = await sb
    .from('packages')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  if (pkgMatch) {
    const { error } = await sb
      .from('packages')
      .update({ current_unit_cost: cost })
      .eq('id', pkgMatch.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, table: 'packages', code, current_unit_cost: cost })
  }

  return NextResponse.json({ error: `Code '${code}' not found in ingredients or packages` }, { status: 404 })
}

// GET /api/unit-price
// Returns all ingredient + package prices in one call, for the admin page.
export async function GET() {
  const sb = createServerClient()

  const [{ data: ings }, { data: pkgs }] = await Promise.all([
    sb.from('ingredients')
      .select('id, code, name, category, vendor_unit_desc, current_unit_cost, updated_at, active, sort_order')
      .eq('active', true)
      .order('sort_order'),
    sb.from('packages')
      .select('id, code, name, size_qty, size_unit, current_unit_cost, active, sort_order')
      .eq('active', true)
      .order('sort_order'),
  ])

  return NextResponse.json({
    ingredients: ings || [],
    packages:    pkgs || [],
  })
}
