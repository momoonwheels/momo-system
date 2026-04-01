import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  // Load ingredients for matching
  const { data: ingredients } = await sb
    .from('ingredients')
    .select('id, code, name, vendor_unit_desc')
    .eq('active', true)
    .order('sort_order')

  const ingredientList = (ingredients || [])
    .map(i => `${i.code}: ${i.name} (${i.vendor_unit_desc})`)
    .join('\n')

  // Ask Claude to parse the receipt text
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY!,
    'anthropic-version': '2023-06-01',
  },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are parsing a food service receipt for a Nepalese food truck business called Momo on the Wheels.

Extract the following from the receipt text and return ONLY valid JSON, no other text:

{
  "vendor_name": "string — vendor/store name",
  "receipt_date": "YYYY-MM-DD",
  "total_amount": number,
  "line_items": [
    {
      "raw_text": "original item text from receipt",
      "qty": number or null,
      "unit": "CS/EA/LB/OZ/etc or null",
      "unit_price": number or null,
      "total_price": number or null,
      "matched_ingredient_code": "ingredient CODE from list below, or null if no match",
      "match_confidence": number between 0 and 1
    }
  ]
}

Rules:
- Skip lines that are discounts, fees, taxes, subtotals, totals, deposits, or store credit lines (negative amounts, "You saved", "BIB", "Subtotal", "Tax", "Total", "REMAINING", "Credit", etc.)
- Only include actual product line items
- For match_confidence: 0.9+ = very confident, 0.7-0.89 = likely match, 0.5-0.69 = possible, below 0.5 = no good match (set matched_ingredient_code to null)
- The receipt format often has item name on one line, then unit/qty/price on the next line — combine them into one entry

My ingredient list (CODE: Name):
${ingredientList}

Receipt text:
${text}`
      }]
    })
  })

  if (!claudeRes.ok) {
    console.error('Claude API error:', claudeRes.status)
    return NextResponse.json({ error: 'Failed to parse receipt' }, { status: 500 })
  }

  const claudeData = await claudeRes.json()
  const rawContent = claudeData.content?.[0]?.text || ''

  let parsed: any
  try {
    const clean = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(clean)
  } catch (e) {
    console.error('JSON parse error:', e, rawContent)
    return NextResponse.json({ error: 'Could not parse Claude response' }, { status: 500 })
  }

  // Build ingredient lookup by code
  const ingByCode = Object.fromEntries((ingredients || []).map(i => [i.code, i]))

  // Create receipt row
  const { data: receipt, error: receiptErr } = await sb
    .from('receipts')
    .insert({
      vendor_name: parsed.vendor_name || null,
      receipt_date: parsed.receipt_date || null,
      total_amount: parsed.total_amount || null,
      raw_ocr_text: text,
      status: 'reviewing'
    })
    .select()
    .single()

  if (receiptErr || !receipt) {
    console.error('Receipt insert error:', receiptErr)
    return NextResponse.json({ error: 'Failed to save receipt' }, { status: 500 })
  }

  // Insert line items
  const lineItems = (parsed.line_items || []).map((item: any) => {
    const ing = item.matched_ingredient_code ? ingByCode[item.matched_ingredient_code] : null
    return {
      receipt_id: receipt.id,
      raw_text: item.raw_text,
      matched_ingredient_id: ing?.id || null,
      match_confidence: ing ? (item.match_confidence || 0.5) : 0,
      quantity: item.qty || null,
      unit: item.unit || null,
      unit_price: item.unit_price || null,
      total_price: item.total_price || null,
      status: 'pending'
    }
  })

  if (lineItems.length > 0) {
    await sb.from('receipt_line_items').insert(lineItems)
  }

  return NextResponse.json({
    id: receipt.id,
    vendor_name: receipt.vendor_name,
    receipt_date: receipt.receipt_date,
    total_amount: receipt.total_amount,
    line_count: lineItems.length
  })
}
