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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'locations') {
    try {
      const data = await squareFetch('/locations')
      return NextResponse.json(data)
    } catch(e) {
      return NextResponse.json({ locations: [], error: String(e) })
    }
  }

  if (action === 'sales') {
    const locationId = searchParams.get('square_location_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    if (!locationId || !startDate || !endDate)
      return NextResponse.json({ error: 'missing params' }, { status: 400 })

    try {
      // Use Orders search - most accurate for sales data
      let allOrders: any[] = []
      let cursor: string | undefined

      do {
        const body: any = {
          location_ids: [locationId],
          query: {
            filter: {
              date_time_filter: {
                created_at: {
                  start_at: `${startDate}T00:00:00-07:00`,
                  end_at: `${endDate}T23:59:59-07:00`
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

      let grossSales = 0
      let tipTotal = 0
      let discountTotal = 0
      let taxTotal = 0
      let refunds = 0
      let orderCount = allOrders.length

      for (const order of allOrders) {
        for (const item of order.line_items || []) {
          grossSales += (item.gross_sales_money?.amount || 0) / 100
          taxTotal += (item.total_tax_money?.amount || 0) / 100
          // Item-level discounts
          for (const disc of item.discounts || []) {
            discountTotal += (disc.applied_money?.amount || 0) / 100
          }
        }
        // Order-level discounts
        for (const disc of order.discounts || []) {
          discountTotal += (disc.applied_money?.amount || 0) / 100
        }
        tipTotal += (order.total_tip_money?.amount || 0) / 100
        if ((order.total_money?.amount || 0) < 0) {
          refunds += Math.abs((order.total_money?.amount || 0)) / 100
        }
      }

      // Net sales = Gross - Discounts - Tax
      const netSales = grossSales - discountTotal - taxTotal

      return NextResponse.json({
        grossSales,
        discountTotal,
        taxTotal,
        tipTotal,
        refunds,
        netSales,
        orderCount,
        debug: { totalOrders: allOrders.length }
      })
    } catch(e) {
      return NextResponse.json({ grossSales:0, netSales:0, tipTotal:0, refunds:0, processingFees:0, orderCount:0, error: String(e) })
    }
  }

  if (action === 'payroll') {
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    try {
      // Use Labor Shifts API - get all locations' shifts
      const shiftsRes = await squareFetch(
        `/labor/shifts?start_at=${startDate}T07:00:00Z&end_at=${endDate}T07:00:00Z&limit=200`
      )

      let totalWages = 0
      let totalHours = 0
      const shiftDetails: any[] = []

      for (const shift of shiftsRes.shifts || []) {
        const hourlyRate = (shift.wage?.hourly_rate?.amount || 0) / 100
        if (shift.start_at && shift.end_at) {
          const hours = (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) / (1000 * 60 * 60)
          totalHours += hours
          totalWages += hours * hourlyRate
          shiftDetails.push({
            employee_id: shift.employee_id,
            hours: hours.toFixed(2),
            rate: hourlyRate,
            wage: (hours * hourlyRate).toFixed(2),
            date: shift.start_at?.split('T')[0]
          })
        }
      }

      // Add estimated payroll taxes (7.65% employer FICA)
      const payrollTaxRate = 0.0765
      const estimatedTaxes = totalWages * payrollTaxRate
      const totalLaborCost = totalWages + estimatedTaxes

      return NextResponse.json({
        totalWages,
        estimatedTaxes,
        totalLaborCost,
        totalHours,
        shiftDetails,
        taxRate: payrollTaxRate
      })
    } catch(e) {
      return NextResponse.json({ totalLaborCost: 0, totalWages: 0, totalHours: 0, error: String(e) })
    }
  }

  if (action === 'loans') {
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    try {
      // Get payouts and look for loan deductions
      let loanRepayment = 0
      let cursor: string | undefined

      do {
        const url = `/payouts?begin_time=${startDate}T00:00:00-07:00&end_time=${endDate}T23:59:59-07:00&limit=100${cursor ? `&cursor=${cursor}` : ''}`
        const payoutsRes = await squareFetch(url)
        
        for (const payout of payoutsRes.payouts || []) {
          // Loan repayments show as payout fee deductions
          for (const fee of payout.payout_fee || []) {
            if (['LOAN_FEE', 'CAPITAL_ADVANCE_REPAYMENT', 'LOAN_REPAYMENT'].includes(fee.type)) {
              loanRepayment += Math.abs((fee.amount_money?.amount || 0) / 100)
            }
          }
          // Also check for manual loan deductions in payout entries
          const entryUrl = `/payouts/${payout.id}/payout-entries?limit=100`
          try {
            const entries = await squareFetch(entryUrl)
            for (const entry of entries.payout_entries || []) {
              if (entry.type === 'LOAN' || entry.type === 'CAPITAL_ADVANCE') {
                loanRepayment += Math.abs((entry.amount_money?.amount || 0) / 100)
              }
            }
          } catch {}
        }
        cursor = payoutsRes.cursor
      } while (cursor)

      return NextResponse.json({ loanRepayment })
    } catch(e) {
      return NextResponse.json({ loanRepayment: 0, error: String(e) })
    }
  }

  if (action === 'processing-fees') {
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    try {
      let processingFees = 0
      const payoutsRes = await squareFetch(
        `/payouts?begin_time=${startDate}T00:00:00-07:00&end_time=${endDate}T23:59:59-07:00&limit=100`
      )
      for (const payout of payoutsRes.payouts || []) {
        for (const fee of payout.payout_fee || []) {
          if (fee.type === 'PROCESSING_FEE') {
            processingFees += Math.abs((fee.amount_money?.amount || 0) / 100)
          }
        }
      }
      return NextResponse.json({ processingFees })
    } catch(e) {
      return NextResponse.json({ processingFees: 0, error: String(e) })
    }
  }

  // Debug payout entries to find labor/loan deductions
  if (action === 'debug') {
    const startDate = searchParams.get('start_date') || '2026-03-17'
    const endDate = searchParams.get('end_date') || '2026-03-22'
    try {
      const payoutsRes = await squareFetch(
        `/payouts?begin_time=${startDate}T07:00:00Z&end_time=${endDate}T07:00:00Z&limit=10`
      )
      const details: any[] = []
      for (const payout of (payoutsRes.payouts || []).slice(0,3)) {
        try {
          const entries = await squareFetch(`/payouts/${payout.id}/payout-entries?limit=50`)
          details.push({
            payout_id: payout.id,
            amount: payout.amount_money,
            date: payout.created_at,
            entries: entries.payout_entries?.map((e:any) => ({
              type: e.type,
              amount: e.amount_money,
              fee_amount: e.fee_amount_money
            }))
          })
        } catch(e) { details.push({ payout_id: payout.id, error: String(e) }) }
      }
      return NextResponse.json({ payouts: payoutsRes.payouts?.length, details })
    } catch(e) {
      return NextResponse.json({ error: String(e) })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// Temporary debug endpoint
