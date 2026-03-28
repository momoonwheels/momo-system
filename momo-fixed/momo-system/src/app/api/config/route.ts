import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const sb = createServerClient()
  const { data, error } = await sb.from('config').select('*').order('group_name').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const results = await Promise.all(
    body.map((item: { id: string; value: number }) =>
      sb.from('config').update({ value: item.value }).eq('id', item.id)
    )
  )
  const errors = results.filter(r => r.error)
  if (errors.length > 0) return NextResponse.json({ error: errors[0].error?.message }, { status: 500 })
  return NextResponse.json({ updated: results.length })
}

export async function PUT(req: NextRequest) {
  return POST(req)
}
