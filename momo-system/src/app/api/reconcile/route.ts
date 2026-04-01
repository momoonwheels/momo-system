import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )

  // Run the match query directly in SQL — same logic we verified works
  const { data: suggested, error } = await sb.rpc('find_receipt_matches')

  if (error) {
    // Fallback: run raw query if RPC doesn't exist yet
    const { data: matches } = await sb.from('receipts').select(`
      id, vendor_name, receipt_date, total_amount, matched_transaction_id
    `).eq('status', 'confirmed').not('total_amount', 'is', null).not('receipt_date', 'is', null)

    const { data: txns } = await sb.from('bank_transactions').select(
      'id, description, transaction_date, debit_amount, matched_receipt_id'
    ).gt('debit_amount', 0)

    return NextResponse.json({ matches: matches || [], txns: txns || [], useClientSide: true })
  }

  return NextResponse.json({ matches: suggested, useClientSide: false })
}

export async function POST(req: Request) {
  const { receipt_id, txn_id, action } = await req.json()
  const cookieStore = cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )

  if (action === 'confirm') {
    await sb.from('receipts').update({ matched_transaction_id: txn_id }).eq('id', receipt_id)
    await sb.from('bank_transactions').update({ matched_receipt_id: receipt_id }).eq('id', txn_id)
  } else if (action === 'unmatch') {
    await sb.from('receipts').update({ matched_transaction_id: null }).eq('id', receipt_id)
    await sb.from('bank_transactions').update({ matched_receipt_id: null }).eq('id', txn_id)
  }

  return NextResponse.json({ ok: true })
}
