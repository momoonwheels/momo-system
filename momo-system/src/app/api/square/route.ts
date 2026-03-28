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
  return res.json()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  // Get all Square locations
  if (action === 'locations') {
    const data = await squareFetch('/locations')
    return NextResponse.json(data)
  }

  // Get detailed sales breakdown
  if (action === 'sales') {
    const locationId = searchParams.get('square_location_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    if (!locationId || !startDate || !endDate) {
      return NextResponse.json({ error: 'square_location_id, start_date, end_date required' }, { status: 400 })
    }

    // Use payments API for accurate breakdown
    const paymentsRes = await squareFetch(
      `/payments?location_id=${locationId}&begin_time=${startDate}T00:00:00Z&end_time=${endDate}T23:59:59Z&limit=200`
    )

    let grossSales = 0
    let tipTotal = 0
    let discounts = 0
    let refunds = 0
    let taxTotal = 0
    let processingFees = 0
    let orderCount = 0

    for (const payment of paymentsRes.payments || []) {
      if (payment.status !== 'COMPLETED') continue
      grossSales += (payment.amount_money?.amount || 0) / 100
      tipTotal += (payment.tip_money?.amount || 0) / 100
      taxTotal += (payment.total_money?.amount || 0) / 100  // will refine below
      refunds += (payment.refunded_money?.amount || 0) / 100
      // Processing fees
      for (const fee of payment.processing_fee || []) {
        processingFees += Math.abs((fee.amount_money?.amount || 0) / 100)
      }
      orderCount++
    }

    // Net sales = gross - tips - refunds - discounts
    const netSales = grossSales - tipTotal - refunds

    return NextResponse.json({
      grossSales,
      tipTotal,
      discounts,
      refunds,
      netSales,
      processingFees,
      orderCount,
      raw: paymentsRes
    })
  }

  // Get payroll/labor costs
  if (action === 'payroll') {
    try {
      const startDate = searchParams.get('start_date')
      const endDate = searchParams.get('end_date')
      const shiftsRes = await squareFetch(
        `/labor/shifts?start_at=${startDate}T00:00:00Z&end_at=${endDate}T23:59:59Z&limit=200`
      )
      let totalLaborCost = 0
      let totalHours = 0
      const shiftDetails: any[] = []
      for (const shift of shiftsRes.shifts || []) {
        const hourlyRate = (shift.wage?.hourly_rate?.amount || 0) / 100
        if (shift.start_at && shift.end_at) {
          const hours = (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) / (1000 * 60 * 60)
          totalHours += hours
          totalLaborCost += hours * hourlyRate
          shiftDetails.push({ hours: hours.toFixed(2), rate: hourlyRate, cost: (hours * hourlyRate).toFixed(2) })
        }
      }
      return NextResponse.json({ totalLaborCost, totalHours, shiftDetails })
    } catch(e) {
      return NextResponse.json({ totalLaborCost: 0, totalHours: 0, shiftDetails: [], error: String(e) })
    }
  }

  // Get Square loan repayments
  if (action === 'loans') {
    try {
      const startDate = searchParams.get('start_date')
      const endDate = searchParams.get('end_date')
      const payoutsRes = await squareFetch(
        `/payouts?begin_time=${startDate}T00:00:00Z&end_time=${endDate}T23:59:59Z&limit=100`
      )
      let loanRepayment = 0
      for (const payout of payoutsRes.payouts || []) {
        for (const item of payout.payout_fee || []) {
          if (item.type === 'LOAN_FEE' || item.type === 'CAPITAL_ADVANCE_REPAYMENT') {
            loanRepayment += Math.abs((item.amount_money?.amount || 0) / 100)
          }
        }
      }
      return NextResponse.json({ loanRepayment, payouts: payoutsRes.payouts?.length || 0 })
    } catch(e) {
      return NextResponse.json({ loanRepayment: 0, error: String(e) })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
