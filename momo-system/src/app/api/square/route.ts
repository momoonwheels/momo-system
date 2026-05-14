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

// Square money helper — converts cents to dollars safely
const m = (money: any): number => (money?.amount || 0) / 100

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

  // ── SALES via Orders Search API ────────────────────────────────
  // Square's dashboard "Net Sales" = Gross Sales − Returns − Discounts
  // The Orders API gives us order.net_amounts which already excludes
  // BOTH discounts AND returns at the order level. So:
  //   netSales = sum(order.net_amounts.total_money)
  //            - sum(order.net_amounts.tip_money)
  //            - sum(order.net_amounts.tax_money)
  //            - sum(order.net_amounts.service_charge_money)
  // (Do NOT subtract refunds — Square has already excluded them from net_amounts.
  //  Subtracting refunds again double-counts the return.)
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
                closed_at: { start_at: startUTC(startDate), end_at: endUTC(endDate) }
              },
              state_filter: { states: ['COMPLETED'] }
            },
            sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' }
          },
          limit: 500,
          ...(cursor ? { cursor } : {})
        }
        const data = await squareFetch('/orders/search', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        allOrders = allOrders.concat(data.orders || [])
        cursor = data.cursor
      } while (cursor)

      let grossOrderTotal = 0   // sum of net_amounts.total_money (already excludes returns + discounts)
      let tipTotal = 0
      let taxTotal = 0
      let serviceChargeTotal = 0
      let discountTotal = 0      // informational only
      let refunds = 0            // informational only (don't subtract again)
      let processingFees = 0
      let orderCount = 0

      for (const order of allOrders) {
        orderCount++
        grossOrderTotal    += m(order.net_amounts?.total_money)
        tipTotal           += m(order.net_amounts?.tip_money)
        taxTotal           += m(order.net_amounts?.tax_money)
        serviceChargeTotal += m(order.net_amounts?.service_charge_money)
        discountTotal      += m(order.total_discount_money)

        // Refunds tracked for reporting/display only, NOT subtracted from netSales
        for (const refund of order.refunds || []) {
          if (refund.status === 'COMPLETED' || refund.status === 'APPROVED') {
            refunds += m(refund.amount_money)
          }
        }

        for (const tender of order.tenders || []) {
          processingFees += m(tender.processing_fee_money)
        }
      }

      // ✅ MATCHES SQUARE DASHBOARD NET SALES
      const netSales = grossOrderTotal - tipTotal - taxTotal - serviceChargeTotal
      // Pre-discount, pre-refund "Gross Sales" line on Square's report
      const grossSales = netSales // (same number since refunds aren't added back here)

      return NextResponse.json({
        grossSales,
        netSales,
        tipTotal,
        taxTotal,
        discountTotal,
        serviceChargeTotal,
        refunds,         // returned but NOT subtracted from netSales
        processingFees,
        orderCount,
        debug: {
          startAt: startUTC(startDate),
          endAt: endUTC(endDate),
          totalOrders: allOrders.length,
        }
      })
    } catch(e) {
      return NextResponse.json({ grossSales:0, netSales:0, tipTotal:0, taxTotal:0, refunds:0, processingFees:0, orderCount:0, error: String(e) })
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
            processingFees += Math.abs(m(entry.fee_amount_money))
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
        totalPayoutAmount += m(payout.amount_money)
        const entriesRes = await squareFetch(`/payouts/${payout.id}/payout-entries?limit=200`)
        let payoutCapital = 0
        for (const entry of entriesRes.payout_entries || []) {
          if (entry.type === 'SQUARE_CAPITAL_PAYMENT') {
            capitalEntries++
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
