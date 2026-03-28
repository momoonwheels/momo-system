import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'

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

  // Get sales data for a location and date range
  if (action === 'sales') {
    const locationId = searchParams.get('square_location_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!locationId || !startDate || !endDate) {
      return NextResponse.json({ error: 'square_location_id, start_date, end_date required' }, { status: 400 })
    }

    // Get orders/payments
    const data = await squareFetch('/orders/search', {
      method: 'POST',
      body: JSON.stringify({
        location_ids: [locationId],
        query: {
          filter: {
            date_time_filter: {
              created_at: {
                start_at: `${startDate}T00:00:00Z`,
                end_at: `${endDate}T23:59:59Z`
              }
            },
            state_filter: { states: ['COMPLETED'] }
          }
        },
        limit: 500
      })
    })

    return NextResponse.json(data)
  }

  // Get payroll data
  if (action === 'payroll') {
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const data = await squareFetch(`/labor/shifts?start_at=${startDate}T00:00:00Z&end_at=${endDate}T23:59:59Z&limit=200`)
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
