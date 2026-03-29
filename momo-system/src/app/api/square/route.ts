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

// PT = UTC-7 in PDT (Mar-Nov)
function startUTC(date: string) { return `${date}T07:00:00.000Z` }
function endUTC(date: string) {
  const d = new Date(date + 'T00:00:00Z')
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0] + 'T06:59:59.999Z'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const startDate = searchParams.get('start_date') || ''
  const endDate = searchParams.get('end_date') || ''

  // ── LOCATIONS ──────────────────────────────────────────────────
  if (action === 'locations') {
    try {
      const data = await squareFetch('/locations')
      return NextResponse.json(data)
    } catch(e) {
      return NextResponse.json({ locations: [], error: String(e) })
    }
  }

  // ── SALES via Payments API ─────────────────────────────────────
  if (action === 'sales') {
    const locationId = searchParams.get('square_location_id')
    if (!locationId || !startDate || !endDate)
      return NextResponse.json({ error: 'missing params' }, { status: 400 })

    try {
      let allPayments: any[] = []
      let cursor: string | undefined

      do {
        let url = `/payments?location_id=${locationId}&begin_time=${startUTC(startDate)}&end_time=${endUTC(endDate)}&limit=200&sort_order=ASC`
        if (cursor) url += `&cursor=${cursor}`
        const data = await squareFetch(url)
        allPayments = allPayments.concat(data.payments || [])
        cursor = data.cursor
      } while (cursor)

      let grossSales = 0
      let tipTotal = 0
      let processingFees = 0
      let refunds = 0
      const completedPayments = allPayments.filter(p => p.status === 'COMPLETED')

      for (const p of completedPayments) {
        // total_money includes tips
        const total = (p.total_money?.amount || 0) / 100
        const tip = (p.tip_money?.amount || 0) / 100
        const refund = (p.refunded_money?.amount || 0) / 100
        grossSales += total
        tipTotal += tip
        refunds += refund
        for (const fee of p.processing_fee || []) {
          processingFees += Math.abs((fee.amount_money?.amount || 0) / 100)
        }
      }

      // Net sales = gross - tips (tips are pass-through to staff)
      // Discounts are already deducted in Square's total_money
      const netSales = grossSales - tipTotal - refunds

      return NextResponse.json({
        grossSales,
        tipTotal,
        refunds,
        processingFees,
        netSales,
        orderCount: completedPayments.length,
        debug: {
          startAt: startUTC(startDate),
          endAt: endUTC(endDate),
          totalPayments: allPayments.length,
          completed: completedPayments.length
        }
      })
    } catch(e) {
      return NextResponse.json({ grossSales:0, netSales:0, tipTotal:0, refunds:0, processingFees:0, orderCount:0, error: String(e) })
    }
  }

  // ── PROCESSING FEES via Payouts ────────────────────────────────
  if (action === 'processing-fees') {
    try {
      const url = `/payouts?begin_time=${startUTC(startDate)}&end_time=${endUTC(endDate)}&limit=100`
      const payoutsRes = await squareFetch(url)
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

  // ── LOANS via Payouts ──────────────────────────────────────────
  if (action === 'loans') {
    try {
      const url = `/payouts?begin_time=${startUTC(startDate)}&end_time=${endUTC(endDate)}&limit=100`
      const payoutsRes = await squareFetch(url)
      let loanRepayment = 0
      let totalPayoutAmount = 0
      let capitalEntries = 0

      for (const payout of payoutsRes.payouts || []) {
        totalPayoutAmount += (payout.amount_money?.amount || 0) / 100
        const entriesRes = await squareFetch(`/payouts/${payout.id}/payout-entries?limit=200`)
        
        let payoutGross = 0
        let payoutFees = 0
        let payoutCapital = 0

        for (const entry of entriesRes.payout_entries || []) {
          if (entry.type === 'CHARGE') {
            // gross sales amount for this entry
            payoutGross += (entry.gross_amount_money?.amount || 0) / 100
            payoutFees += Math.abs((entry.fee_amount_money?.amount || 0) / 100)
          }
          if (entry.type === 'SQUARE_CAPITAL_PAYMENT') {
            capitalEntries++
            // Try all possible amount fields
            const amt = (entry.amount_money?.amount || 
                        entry.gross_amount_money?.amount || 
                        entry.net_amount_money?.amount || 0) / 100
            payoutCapital += Math.abs(amt)
          }
        }
        loanRepayment += payoutCapital
      }

      return NextResponse.json({ 
        loanRepayment, 
        totalPayoutAmount,
        capitalEntries,
        debug: { payouts: payoutsRes.payouts?.length }
      })
    } catch(e) {
      return NextResponse.json({ loanRepayment: 0, error: String(e) })
    }
  }

  // ── PAYROLL (Labor Shifts) ─────────────────────────────────────
  if (action === 'payroll') {
    try {
      const shiftsRes = await squareFetch(
        `/labor/shifts?start_at=${startUTC(startDate)}&end_at=${endUTC(endDate)}&limit=200`
      )
      let totalWages = 0, totalHours = 0
      for (const shift of shiftsRes.shifts || []) {
        const rate = (shift.wage?.hourly_rate?.amount || 0) / 100
        if (shift.start_at && shift.end_at) {
          const hours = (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) / 3600000
          totalHours += hours
          totalWages += hours * rate
        }
      }
      const estimatedTaxes = totalWages * 0.0765
      return NextResponse.json({ totalWages, estimatedTaxes, totalLaborCost: totalWages + estimatedTaxes, totalHours })
    } catch(e) {
      return NextResponse.json({ totalLaborCost: 0, totalWages: 0, totalHours: 0, error: String(e) })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
