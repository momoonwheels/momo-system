import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  let query = sb.from('receipts').select('*, receipt_line_items(*)')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const body = await req.json()
  const { image_base64, image_url, manual_entry } = body

  // Manual entry path
  if (manual_entry) {
    const { data, error } = await sb.from('receipts').insert({
      vendor_name: body.vendor_name,
      receipt_date: body.receipt_date,
      total_amount: body.total_amount,
      status: 'reviewing',
      notes: 'Manual entry'
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Get all ingredients for matching
  const { data: ingredients } = await sb.from('ingredients').select('id,code,name,recipe_unit')
  const ingList = (ingredients||[]).map(i => `${i.code}: ${i.name} (${i.recipe_unit})`).join('\n')

  // OCR via Claude API
  const imageContent: any = image_base64
    ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image_base64 } }
    : { type: 'image', source: { type: 'url', url: image_url } }

  const prompt = `You are parsing a grocery/food service receipt for a Nepali food truck business.

Extract ALL line items from this receipt. For each item, try to match it to one of these inventory ingredients:
${ingList}

Return ONLY valid JSON in this exact format, no other text:
{
  "vendor_name": "store name or null",
  "receipt_date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "line_items": [
    {
      "raw_text": "exact text from receipt",
      "matched_code": "ingredient CODE from list above or null",
      "match_confidence": 0.0-1.0,
      "quantity": number or null,
      "unit": "unit string or null",
      "unit_price": number or null,
      "total_price": number or null
    }
  ]
}`

  let parsed: any = null
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [imageContent, { type: 'text', text: prompt }] }]
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    parsed = JSON.parse(text.replace(/```json|```/g,'').trim())
  } catch (e) {
    // OCR failed — return for manual entry
    const { data } = await sb.from('receipts').insert({ status: 'reviewing', notes: 'OCR failed — manual entry required' }).select().single()
    return NextResponse.json({ ...data, ocr_failed: true })
  }

  // Save receipt
  const { data: receipt, error: rErr } = await sb.from('receipts').insert({
    vendor_name: parsed.vendor_name,
    receipt_date: parsed.receipt_date,
    total_amount: parsed.total_amount,
    raw_ocr_text: JSON.stringify(parsed),
    status: 'reviewing'
  }).select().single()
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  // Build ingredient lookup
  const ingMap: Record<string,string> = {}
  for (const ing of ingredients||[]) ingMap[ing.code] = ing.id

  // Save line items
  const lineItems = (parsed.line_items||[]).map((item: any) => ({
    receipt_id: receipt.id,
    raw_text: item.raw_text,
    matched_ingredient_id: item.matched_code ? ingMap[item.matched_code] : null,
    match_confidence: item.match_confidence,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    total_price: item.total_price,
    status: item.match_confidence >= 0.8 ? 'pending' : 'pending'
  }))

  await sb.from('receipt_line_items').insert(lineItems)

  return NextResponse.json({ ...receipt, line_items: lineItems, parsed })
}
