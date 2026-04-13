import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// ─── Location coordinates ─────────────────────────────────────────────────────
const COORDS: Record<string, { lat: number; lon: number }> = {
  lincoln: { lat: 44.9571, lon: -124.0177 },
  salem:   { lat: 44.9429, lon: -123.0351 },
}

function getCoords(locationName: string) {
  const n = locationName.toLowerCase()
  if (n.includes('lincoln') || n.includes('pines')) return COORDS.lincoln
  return COORDS.salem
}

// ─── WMO weather code descriptions ───────────────────────────────────────────
const WMO: Record<number, string> = {
  0:'Clear', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
  45:'Fog', 48:'Fog', 51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
  61:'Light rain', 63:'Rain', 65:'Heavy rain',
  80:'Rain showers', 81:'Showers', 82:'Heavy showers',
  95:'Thunderstorm', 96:'Thunderstorm', 99:'Thunderstorm',
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const {
      location_id,
      week_start,
      location_name,
      operating_days,   // e.g. ['wed','thu','fri','sat','sun']
      week_start_day,   // e.g. 'wednesday'
      menu_items,       // [{ id, code, name }]
    } = await req.json()

    if (!location_id || !week_start || !menu_items?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sb = createServerClient()

    // ── 1. Last 4 weeks of planned orders ─────────────────────────────────── 
    // Fetch actual weeks from DB (not calculated) so dates always align
    const { data: historyData } = await sb
      .from('planned_orders')
      .select('*, menu_items(code)')
      .eq('location_id', location_id)
      .lt('week_start', week_start)
      .order('week_start', { ascending: false })
      .limit(25)  // 5 weeks × 5 items max

    // Get up to 4 distinct week_starts actually in the DB
    const seen = new Set<string>()
    const historyWeeks: string[] = []
    for (const r of (historyData ?? [])) {
      if (!seen.has(r.week_start)) { seen.add(r.week_start); historyWeeks.push(r.week_start) }
      if (historyWeeks.length >= 4) break
    }
    
    // The most recent week in history may be incomplete (current week still running)
    // Flag it so the AI knows not to treat it as a full week
    const today = new Date().toISOString().split('T')[0]
    const mostRecentWeek = historyWeeks[0] ?? ''
    const mostRecentWeekEnd = addDays(mostRecentWeek, 13) // generous window
    const mostRecentIsPartial = mostRecentWeek && mostRecentWeekEnd >= today

    // ── 2. Weather forecast (Open-Meteo, free, no key) ───────────────────────
    let weatherSummary = 'Weather: unavailable'
    try {
      const { lat, lon } = getCoords(location_name)
      const weekEnd = addDays(week_start, 6)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=America%2FLos_Angeles&start_date=${week_start}&end_date=${weekEnd}&temperature_unit=fahrenheit`
      const res  = await fetch(url)
      const json = await res.json()
      if (json?.daily) {
        const { time, temperature_2m_max, temperature_2m_min, precipitation_sum, weathercode } = json.daily
        weatherSummary = 'Weather forecast:\n' + (time as string[]).map((date: string, i: number) => {
          const desc = WMO[weathercode[i]] ?? `Code ${weathercode[i]}`
          const rain = Number(precipitation_sum[i]).toFixed(1)
          const lo   = Math.round(temperature_2m_min[i])
          const hi   = Math.round(temperature_2m_max[i])
          return `  ${date}: ${desc}, ${lo}–${hi}°F, ${rain}mm rain`
        }).join('\n')
      }
    } catch (e) {
      console.error('Weather fetch failed:', e)
    }

    // ── 3. Square last year same week (best effort) ───────────────────────────
    let squareSummary = 'Last year same week: no Square data available'
    try {
      const sqToken = process.env.SQUARE_ACCESS_TOKEN
      if (sqToken) {
        const lyStart = addDays(week_start, -364)
        const lyEnd   = addDays(week_start, -358)

        // Match Square location by name
        const sqLocsRes = await fetch('https://connect.squareup.com/v2/locations', {
          headers: { Authorization: `Bearer ${sqToken}`, 'Square-Version': '2024-01-18' }
        })
        const sqLocs = await sqLocsRes.json()
        const n = location_name.toLowerCase()
        const sqLoc = (sqLocs.locations ?? []).find((l: any) => {
          const ln = l.name?.toLowerCase() ?? ''
          return n.includes('lincoln')
            ? ln.includes('lincoln') || ln.includes('pines')
            : ln.includes('salem')
        })

        if (sqLoc) {
          const pmtRes = await fetch(
            `https://connect.squareup.com/v2/payments?location_id=${sqLoc.id}&begin_time=${lyStart}T07:00:00Z&end_time=${lyEnd}T06:59:59Z&limit=200`,
            { headers: { Authorization: `Bearer ${sqToken}`, 'Square-Version': '2024-01-18' } }
          )
          const pmtData  = await pmtRes.json()
          const payments = pmtData.payments ?? []
          const revenue  = payments.reduce((s: number, p: any) => s + (p.total_money?.amount ?? 0), 0) / 100
          const txCount  = payments.length
          squareSummary = `Last year same week (${lyStart} to ${lyEnd}): ${txCount} transactions, $${revenue.toFixed(0)} total revenue at ${location_name}`
        }
      }
    } catch (e) {
      console.error('Square fetch failed:', e)
    }

    // ── 4. Format history for prompt ─────────────────────────────────────────
    const historyText = historyWeeks.map(ws => {
      const rows = (historyData ?? []).filter(r => r.week_start === ws)
      if (!rows.length) return `Week of ${ws}: no data recorded`
      const grandTotal = rows.reduce((s, r) =>
        s + operating_days.reduce((ds: number, d: string) => ds + (Number(r[d]) || 0), 0), 0)
      const byItem = rows.map(r => {
        const code  = (r.menu_items as any)?.code ?? '?'
        const days  = operating_days.map((d: string) => `${d}:${r[d] ?? 0}`).join(' ')
        const total = operating_days.reduce((ds: number, d: string) => ds + (Number(r[d]) || 0), 0)
        return `  ${code}: [${days}] total=${total}`
      }).join('\n')
      return `Week of ${ws} (${grandTotal} plates total):\n${byItem}`
    }).join('\n\n')

    // ── 5. Build Claude prompt ────────────────────────────────────────────────
    const weekEnd = addDays(week_start, 6)

    const prompt = `You are a sales forecasting assistant for Mo:Mo on the Wheels, a Nepalese food truck business in Oregon.

LOCATION: ${location_name}
FORECAST WEEK: ${week_start} to ${weekEnd}
OPERATING DAYS THIS WEEK: ${operating_days.join(', ')} (${operating_days.length} days)

MENU ITEMS:
${menu_items.map((m: any) => `- ${m.code}: ${m.name}`).join('\n')}

RECENT SALES HISTORY (plates per day, last 4 weeks):
${historyText || 'No history available yet'}

${weatherSummary}

${squareSummary}

BUSINESS CONTEXT:
- Food truck operation in Oregon (Pacific Northwest)
- Rain and cold weather significantly reduces walk-up food truck sales
- Lincoln City is a coastal tourist town — weekend and summer sales are much higher than weekdays
- Salem is an inland city with more consistent weekday demand (opened April 3, 2026 — still building customer base)
- Weekends (Fri/Sat/Sun) typically outsell weekdays 2–3x
- CW (Chowmein) is typically 15–20% of total plates
- REG (Regular Mo:Mo) is typically the top seller at 35–40% of plates
- April is shoulder season in Lincoln City, ramping toward summer peak (June–September)
- IMPORTANT: Any week marked ⚠️ PARTIAL WEEK is still in progress — use it only for daily rate context, not total volume trends
- IMPORTANT: Salem opened April 3, 2026 — early weeks are partial and sales are still growing as word spreads
- Look at week-over-week trends using only COMPLETE weeks

TASK: Forecast how many plates of each menu item will sell on each operating day for the week of ${week_start}.

Rules:
- Only put non-zero values on operating days: ${operating_days.join(', ')}
- All other days must be 0
- Be realistic — base your forecast on the history trend and weather impact
- If weather looks bad (rain, cold), reduce weekend numbers
- If weather is good, boost weekends slightly vs prior week

Respond ONLY with valid JSON (no markdown, no text outside the JSON):
{
  "forecast": {
    "REG": { "mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0 },
    "FRI": { "mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0 },
    "CHI": { "mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0 },
    "JHO": { "mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0 },
    "CW":  { "mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0 }
  },
  "note": "2-3 sentence explanation covering: what trend the data shows, how weather affected the forecast, and the projected total plates vs last week."
}`

    // ── 6. Call Claude API ────────────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const claudeData = await claudeRes.json()
    const rawText    = claudeData.content?.[0]?.text ?? ''

    let forecast: Record<string, Record<string, number>> = {}
    let note = ''

    try {
      const clean  = rawText.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      forecast = parsed.forecast
      note     = parsed.note
    } catch {
      return NextResponse.json({ error: 'Could not parse AI response', raw: rawText }, { status: 500 })
    }

    // ── 7. Save note to DB (non-fatal — run migration_ai_forecast.sql if missing) ──
    try {
      await sb.from('planned_order_notes').upsert(
        { location_id, week_start, notes: note, generated_at: new Date().toISOString() },
        { onConflict: 'location_id,week_start' }
      )
    } catch (e) {
      console.warn('Could not save AI note (table may not exist yet):', e)
    }

    return NextResponse.json({ forecast, note })

  } catch (e: any) {
    console.error('AI forecast error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
