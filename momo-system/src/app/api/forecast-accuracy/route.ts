import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

const AVG_PLATE_PRICE = 14.5

// ─── GET: fetch accuracy history for a location ───────────────────────────────
export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const location_id = searchParams.get('location_id')
  const limit       = parseInt(searchParams.get('limit') ?? '8')

  if (!location_id) return NextResponse.json({ error: 'location_id required' }, { status: 400 })

  const { data, error } = await sb
    .from('forecast_accuracy')
    .select('*')
    .eq('location_id', location_id)
    .eq('week_closed', true)
    .order('week_start', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── POST: save AI forecast or saved forecast ─────────────────────────────────
export async function POST(req: NextRequest) {
  const sb   = createServerClient()
  const body = await req.json()
  const { type, location_id, week_start } = body

  if (!location_id || !week_start) {
    return NextResponse.json({ error: 'location_id and week_start required' }, { status: 400 })
  }

  if (type === 'ai') {
    // Save AI's original forecast
    const { ai_forecast, ai_total_plates } = body
    const { error } = await sb.from('forecast_accuracy').upsert({
      location_id,
      week_start,
      ai_forecast,
      ai_total_plates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'location_id,week_start' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === 'saved') {
    // Save user-adjusted forecast
    const { saved_forecast, saved_total_plates } = body
    const { error } = await sb.from('forecast_accuracy').upsert({
      location_id,
      week_start,
      saved_forecast,
      saved_total_plates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'location_id,week_start' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === 'close') {
    // Close the week: fetch Square actuals and compute variance
    const { square_location_id } = body
    const sqToken = process.env.SQUARE_ACCESS_TOKEN

    if (!sqToken || !square_location_id) {
      return NextResponse.json({ error: 'Square not configured' }, { status: 400 })
    }

    // Calculate week end
    const we = addDays(week_start, 6)

    // Fetch Square payments for this week
    let grossSales  = 0
    let orderCount  = 0
    let cursor      = ''

    try {
      do {
        const url = `https://connect.squareup.com/v2/payments?location_id=${square_location_id}&begin_time=${week_start}T07:00:00Z&end_time=${we}T06:59:59Z&limit=200${cursor ? `&cursor=${cursor}` : ''}`
        const res  = await fetch(url, {
          headers: { Authorization: `Bearer ${sqToken}`, 'Square-Version': '2024-01-18' }
        })
        const data = await res.json()
        for (const p of data.payments ?? []) {
          if (p.status === 'COMPLETED') {
            grossSales += (p.total_money?.amount ?? 0)
            orderCount++
          }
        }
        cursor = data.cursor ?? ''
      } while (cursor)

      grossSales = grossSales / 100
    } catch (e) {
      return NextResponse.json({ error: 'Square fetch failed' }, { status: 500 })
    }

    const actualEstPlates = Math.round(grossSales / AVG_PLATE_PRICE)

    // Get existing record to compute variances
    const { data: existing } = await sb
      .from('forecast_accuracy')
      .select('ai_total_plates, saved_total_plates')
      .eq('location_id', location_id)
      .eq('week_start', week_start)
      .maybeSingle()

    const aiVariancePct = existing?.ai_total_plates && actualEstPlates > 0
      ? Math.round(((existing.ai_total_plates - actualEstPlates) / actualEstPlates) * 100)
      : null

    const savedVariancePct = existing?.saved_total_plates && actualEstPlates > 0
      ? Math.round(((existing.saved_total_plates - actualEstPlates) / actualEstPlates) * 100)
      : null

    const { error } = await sb.from('forecast_accuracy').upsert({
      location_id,
      week_start,
      actual_gross_sales:  grossSales,
      actual_order_count:  orderCount,
      actual_est_plates:   actualEstPlates,
      ai_variance_pct:     aiVariancePct,
      saved_variance_pct:  savedVariancePct,
      week_closed:         true,
      closed_at:           new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    }, { onConflict: 'location_id,week_start' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      grossSales,
      orderCount,
      actualEstPlates,
      aiVariancePct,
      savedVariancePct,
    })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
