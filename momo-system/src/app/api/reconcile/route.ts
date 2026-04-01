import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: rows, error } = await sb.rpc('find_receipt_matches')

  if (error) {
    console.error('find_receipt_matches error:', error)
    return NextResponse.json({ suggested: [], confirmed: [], unmatched: [], error: error.message })
  }

  const matchedReceiptIds = new Set((rows || []).map((r: any) => r.receipt_id))
  const confirmed = (rows || []).filter((r: any) => r.is_confirmed)
  const suggested = (rows || []).filter((r: any) => !r.is_confirmed)

  const { data: allReceipts } = await sb
    .from('receipts')
    .select('receipt_id:id, vendor_name, receipt_date, total_amount')
    .eq('status', 'confirmed')
    .not('total_amount', 'is', null)
    .not('receipt_date', 'is', null)

  const unmatched = (allReceipts || []).filter((r: any) => !matchedReceiptIds.has(r.receipt_id))

  return NextResponse.json({ suggested, confirmed, unmatched })
}

export async function POST(req: Request) {
  const { receipt_id, txn_id, action } = await req.json()

  if (action === 'confirm') {
    await sb.from('receipts').update({ matched_transaction_id: txn_id }).eq('id', receipt_id)
    await sb.from('bank_transactions').update({ matched_receipt_id: receipt_id }).eq('id', txn_id)
  } else if (action === 'unmatch') {
    await sb.from('receipts').update({ matched_transaction_id: null }).eq('id', receipt_id)
    await sb.from('bank_transactions').update({ matched_receipt_id: null }).eq('id', txn_id)
  }

  return NextResponse.json({ ok: true })
}
