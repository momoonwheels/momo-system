import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

// PATCH /api/ingredient-buffer
// body: { code, buffer_pct }   (number, 0–1000)
export async function PATCH(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const { code, buffer_pct } = body
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const pct = Number(buffer_pct)
  if (isNaN(pct) || pct < 0 || pct > 1000) {
    return NextResponse.json({ error: 'buffer_pct must be a number between 0 and 1000' }, { status: 400 })
  }

  const { data, error } = await sb
    .from('ingredients')
    .update({ buffer_pct: pct })
    .eq('code', code)
    .select('code, buffer_pct')
    .single()

  if (error) {
    console.error('ingredient-buffer PATCH failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, code: data.code, buffer_pct: data.buffer_pct })
}
