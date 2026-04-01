import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  // Return unmatched receipts (no SQL match found)
  if (searchParams.get('unmatched') === '1') {
    const { data } = await sb
      .from('receipts')
      .select('id, vendor_name, receipt_date, total_amount')
      .eq('status', 'confirmed')
      .not('total_amount', 'is', null)
      .not('receipt_date', 'is', null)
      .is('matched_transaction_id', null)
    return NextResponse.json({ unmatched: data || [] })
  }

  // Try the SQL function first
  const { data: matches, error } = await sb.rpc('find_receipt_matches')

  if (error) {
    console.error('RPC error, falling back:', error)
    // Fallback: return raw data for client-side matching
    const { data: receipts } = await sb
      .from('receipts')
      .select('id, vendor_name, receipt_date, total_amount, matched_transaction_id')
      .eq('status', 'confirmed')
      .not('total_amount', 'is', null)
      .not('receipt_date', 'is', null)

    const { data: txns } = await sb
      .from('bank_transactions')
      .select('id, description, transaction_date, debit_amount, matched_receipt_id')
      .gt('debit_amount', 0)

    return NextResponse.json({ matches: receipts || [], txns: txns || [], useClientSide: true })
  }

  return NextResponse.json({ matches: matches || [], useClientSide: false })
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
