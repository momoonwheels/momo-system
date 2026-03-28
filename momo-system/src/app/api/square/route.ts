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
        // Gross = all line items before discounts
        for (const item of order.line_items || []) {
          grossSales += (item.gross_sales_money?.amount || 0) / 100
          discountTotal += (item.total_discount_money?.amount || 0) / 100
          taxTotal += (item.total_tax_money?.amount || 0) / 100
        }
        tipTotal += (order.total_tip_money?.amount || 0) / 100
        refunds += (order.total_money?.amount || 0) < 0 
          ? Math.abs((order.total_money?.amount || 0)) / 100 : 0
      }

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
      // Square Payroll API - get payroll runs
      const payrollRes = await fetch('https://connect.squareup.com/v2/payroll/payrolls', {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Square-Version': '2024-01-18'
        }
      })
      
      let totalLaborCost = 0
      
      if (payrollRes.ok) {
        const data = await payrollRes.json()
        for (const payroll of data.payrolls || []) {
          const periodStart = payroll.pay_period?.start_date
          const periodEnd = payroll.pay_period?.end_date
          // Check if payroll period overlaps with our date range
          if (periodEnd >= startDate! && periodStart <= endDate!) {
            totalLaborCost += (payroll.net_pay_amount?.amount || 0) / 100
          }
        }
      } else {
        // Fallback: use labor shifts
        const shiftsRes = await squareFetch(
          `/labor/shifts?start_at=${startDate}T00:00:00Z&end_at=${endDate}T23:59:59Z&limit=200`
        )
        for (const shift of shiftsRes.shifts || []) {
          const hourlyRate = (shift.wage?.hourly_rate?.amount || 0) / 100
          if (shift.start_at && shift.end_at) {
            const hours = (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) / (1000 * 60 * 60)
            totalLaborCost += hours * hourlyRate
          }
        }
      }

      return NextResponse.json({ totalLaborCost })
    } catch(e) {
      return NextResponse.json({ totalLaborCost: 0, error: String(e) })
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

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
