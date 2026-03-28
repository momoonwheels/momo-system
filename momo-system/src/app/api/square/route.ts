import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const SQUARE_BASE = 'https://connect.squareup.com/v2'
const TOKEN = process.env.SQUARE_ACCESS_TOKEN

async function squareFetch(path: string, options: any = {}) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-18',
      ...options.headers
    }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Square API error ${res.status}: ${text}`)
  }
  return res.json()
}

// America/Los_Angeles is UTC-7 in PDT (Mar-Nov), UTC-8 in PST (Nov-Mar)
// Using UTC-7 (PDT) for March dates
function toRFC3339Start(date: string) { return `${date}T07:00:00.000Z` }
function toRFC3339End(date: string) { 
  // End of day PT = next day 06:59:59 UTC
  const d = new Date(date + 'T00:00:00Z')
  d.setDate(d.getDate() + 1)
  const next = d.toISOString().split('T')[0]
  return `${next}T06:59:59.999Z`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const startDate = searchParams.get('start_date') || ''
  const endDate = searchParams.get('end_date') || ''

  // ── LOCATIONS ────────────────────────────────────────────────────
  if (action === 'locations') {
    try {
      const data = await squareFetch('/locations')
      return NextResponse.json(data)
    } catch(e) {
      return NextResponse.json({ locations: [], error: String(e) })
    }
  }

  // ── SALES ────────────────────────────────────────────────────────
  if (action === 'sales') {
    const locationId = searchParams.get('square_location_id')
    if (!locationId || !startDate || !endDate)
      return NextResponse.json({ error: 'missing params' }, { status: 400 })

    try {
      let allOrders: any[] = []
      let cursor: string | undefined

      do {
        const body: any = {
          location_ids: [locationId],
          query: {
            filter: {
              date_time_filter: {
                closed_at: {
                  start_at: toRFC3339Start(startDate),
                  end_at: toRFC3339End(endDate)
                }
              },
              state_filter: { states: ['COMPLETED'] }
            }
          },
          return_entries: true,
          limit: 500
        }
        if (cursor) body.cursor = cursor
        const data = await squareFetch('/orders/search', { method: 'POST', body: JSON.stringify(body) })
        allOrders = allOrders.concat(data.orders || [])
        cursor = data.cursor
      } while (cursor)

      let grossSales = 0, tipTotal = 0, discountTotal = 0, taxTotal = 0, refunds = 0
      const orderCount = allOrders.length

      for (const order of allOrders) {
        for (const item of order.line_items || []) {
          grossSales += (item.gross_sales_money?.amount || 0) / 100
          taxTotal += (item.total_tax_money?.amount || 0) / 100
          for (const disc of item.discounts || []) {
            discountTotal += (disc.applied_money?.amount || 0) / 100
          }
        }
        for (const disc of order.discounts || []) {
          discountTotal += (disc.applied_money?.amount || 0) / 100
        }
        tipTotal += (order.total_tip_money?.amount || 0) / 100
        if ((order.total_money?.amount || 0) < 0) {
          refunds += Math.abs((order.total_money?.amount || 0)) / 100
        }
      }

      const netSales = grossSales - discountTotal - taxTotal
      return NextResponse.json({ 
        grossSales, discountTotal, taxTotal, tipTotal, refunds, netSales, orderCount,
        debug: { 
          startAt: toRFC3339Start(startDate),
          endAt: toRFC3339End(endDate),
          totalOrders: allOrders.length
        }
      })
    } catch(e) {
      return NextResponse.json({ grossSales:0, netSales:0, tipTotal:0, refunds:0, discountTotal:0, orderCount:0, error: String(e) })
    }
  }

  // ── PAYROLL (Labor) ──────────────────────────────────────────────
  if (action === 'payroll') {
    try {
      const shiftsRes = await squareFetch(
        `/labor/shifts?start_at=${toRFC3339Start(startDate)}&end_at=${toRFC3339End(endDate)}&limit=200`
      )
      let totalWages = 0, totalHours = 0
      for (const shift of shiftsRes.shifts || []) {
        const hourlyRate = (shift.wage?.hourly_rate?.amount || 0) / 100
        if (shift.start_at && shift.end_at) {
          const hours = (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) / (1000 * 60 * 60)
          totalHours += hours
          totalWages += hours * hourlyRate
        }
      }
      const estimatedTaxes = totalWages * 0.0765
      const totalLaborCost = totalWages + estimatedTaxes
      return NextResponse.json({ totalWages, estimatedTaxes, totalLaborCost, totalHours })
    } catch(e) {
      return NextResponse.json({ totalLaborCost: 0, totalWages: 0, totalHours: 0, error: String(e) })
    }
  }

  // ── LOANS (Square Capital) ────────────────────────────────────────
  if (action === 'loans') {
    try {
      // Try Square Capital API first
      const capitalRes = await squareFetch('/capital/financing-summaries')
      let loanRepayment = 0

      if (capitalRes.financing_summaries) {
        for (const summary of capitalRes.financing_summaries) {
          // Get payments within date range from activities
          const activitiesRes = await squareFetch(
            `/capital/financing-summaries/${summary.financing_program_id}/activities?begin_time=${toRFC3339Start(startDate)}&end_time=${toRFC3339End(endDate)}`
          )
          for (const activity of activitiesRes.activities || []) {
            if (activity.type === 'PAYMENT') {
              loanRepayment += Math.abs((activity.amount_money?.amount || 0) / 100)
            }
          }
        }
      }

      // Fallback: count SQUARE_CAPITAL_PAYMENT entries in payouts
      // Each entry = one transaction's loan deduction
      if (loanRepayment === 0) {
        const payoutsUrl = `/payouts?begin_time=${toRFC3339Start(startDate)}&end_time=${toRFC3339End(endDate)}&limit=100`
        const payoutsRes = await squareFetch(payoutsUrl)
        let capitalEntryCount = 0

        for (const payout of payoutsRes.payouts || []) {
          const entriesRes = await squareFetch(`/payouts/${payout.id}/payout-entries?limit=200`)
          for (const entry of entriesRes.payout_entries || []) {
            if (entry.type === 'SQUARE_CAPITAL_PAYMENT') {
              capitalEntryCount++
              // The loan deduction per transaction is proportional
              // Each SQUARE_CAPITAL_PAYMENT entry = one sale that had loan deducted
              // We need the actual amount from gross_amount_money
              loanRepayment += Math.abs((entry.gross_amount_money?.amount || entry.amount_money?.amount || 0) / 100)
            }
          }
        }
      }

      return NextResponse.json({ loanRepayment })
    } catch(e) {
      return NextResponse.json({ loanRepayment: 0, error: String(e) })
    }
  }

  // ── PROCESSING FEES ──────────────────────────────────────────────
  if (action === 'processing-fees') {
    try {
      const payoutsUrl = `/payouts?begin_time=${toRFC3339Start(startDate)}&end_time=${toRFC3339End(endDate)}&limit=100`
      const payoutsRes = await squareFetch(payoutsUrl)
      let processingFees = 0

      for (const payout of payoutsRes.payouts || []) {
        const entriesRes = await squareFetch(`/payouts/${payout.id}/payout-entries?limit=200`)
        for (const entry of entriesRes.payout_entries || []) {
          if (entry.type === 'CHARGE') {
            processingFees += Math.abs((entry.fee_amount_money?.amount || 0) / 100)
          }
        }
      }
      return NextResponse.json({ processingFees })
    } catch(e) {
      return NextResponse.json({ processingFees: 0, error: String(e) })
    }
  }

  // ── PAYROLL DEBUG - test multiple endpoints ──────────────────────
  if (action === 'payroll-debug') {
    const results: any = {}
    const endpoints = [
      '/payroll/payrolls',
      '/payroll/payrolls?status=FINALIZED',
      '/v2/payroll/payrolls',
      '/team/v2/jobs',
    ]
    for (const ep of endpoints) {
      try {
        const res = await fetch(`${SQUARE_BASE}${ep}`, {
          headers: { 'Authorization': `Bearer ${TOKEN}`, 'Square-Version': '2024-01-18' }
        })
        const text = await res.text()
        results[ep] = { status: res.status, body: text.substring(0, 300) }
      } catch(e) {
        results[ep] = { error: String(e) }
      }
    }
    return NextResponse.json(results)
  }

  // ── DEBUG ─────────────────────────────────────────────────────────
  if (action === 'debug') {
    try {
      const payoutsUrl = `/payouts?begin_time=${toRFC3339Start(startDate)}&end_time=${toRFC3339End(endDate)}&limit=5`
      const payoutsRes = await squareFetch(payoutsUrl)
      const details: any[] = []

      for (const payout of (payoutsRes.payouts || []).slice(0, 2)) {
        const entriesRes = await squareFetch(`/payouts/${payout.id}/payout-entries?limit=50`)
        details.push({
          payout_id: payout.id,
          payout_amount_cents: payout.amount_money?.amount,
          date: payout.created_at,
          entries: entriesRes.payout_entries?.map((e: any) => ({
            type: e.type,
            amount_cents: e.amount_money?.amount,
            fee_cents: e.fee_amount_money?.amount
          }))
        })
      }
      return NextResponse.json({ total_payouts: payoutsRes.payouts?.length, details })
    } catch(e) {
      return NextResponse.json({ error: String(e) })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
