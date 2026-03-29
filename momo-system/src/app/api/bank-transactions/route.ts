import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// ─── Auto-categorizer ────────────────────────────────────────────────────────
function categorize(memo: string, description: string, code: string): { category: string; subcategory: string; is_personal: boolean } {
  const m = (memo + ' ' + description).toUpperCase()

  // REVENUE
  if (m.includes('SQUARE INC') && (m.includes(' SQ2') || m.includes('SQ CAP')))
    return { category: 'Revenue', subcategory: 'Square Deposit', is_personal: false }

  // LABOR
  if (m.includes('SQUARE INC') && m.includes('PAYR DD'))
    return { category: 'Labor', subcategory: 'Payroll Direct Deposit', is_personal: false }
  if (m.includes('SQUARE INC') && m.includes('PAYR TAX'))
    return { category: 'Labor', subcategory: 'Payroll Tax (Square)', is_personal: false }
  if (m.includes('SQUARE INC') && m.includes('PAYR MISC'))
    return { category: 'Labor', subcategory: 'Payroll Misc', is_personal: false }
  if (m.includes('SQUARE INC') && m.includes('SQ260102') && code === 'XWTH')
    return { category: 'Labor', subcategory: 'Square Fee', is_personal: false }
  if (m.includes('IRS') && m.includes('USATAXPYMT'))
    return { category: 'Taxes', subcategory: 'IRS Federal Tax', is_personal: false }
  if (m.includes('OR REVENUE DEPT') && m.includes('TAXPAYMENT'))
    return { category: 'Taxes', subcategory: 'Oregon State Tax', is_personal: false }

  // FOOD COST
  if (m.includes('CHEFSTORE'))
    return { category: 'Food Cost', subcategory: 'ChefStore', is_personal: false }
  if (m.includes('RINELLA PRODUCE'))
    return { category: 'Food Cost', subcategory: 'Rinella Produce', is_personal: false }
  if (m.includes('SP GANDHI') || m.includes('GANDHI FOOD'))
    return { category: 'Food Cost', subcategory: 'SP Gandhi Foods', is_personal: false }
  if (m.includes('BAZAAR INTERNATIONA'))
    return { category: 'Food Cost', subcategory: 'Bazaar International', is_personal: false }
  if (m.includes('INDIA SUPERMARKET') || m.includes('INDIAN CONNECTIO'))
    return { category: 'Food Cost', subcategory: 'Indian/Asian Grocery', is_personal: false }
  if (m.includes('MAIS ASIAN MARKET'))
    return { category: 'Food Cost', subcategory: 'Mais Asian Market', is_personal: false }
  if (m.includes('MCKAYS MARKET'))
    return { category: 'Food Cost', subcategory: 'McKays Market', is_personal: false }
  if (m.includes('KENNYS IGA'))
    return { category: 'Food Cost', subcategory: 'Kennys IGA', is_personal: false }
  if (m.includes('EL TORITO MEAT'))
    return { category: 'Food Cost', subcategory: 'El Torito Meat', is_personal: false }
  if (m.includes('NORTHWEST NATURA'))
    return { category: 'Food Cost', subcategory: 'Northwest Natural', is_personal: false }
  if (m.includes('THE WEBSTAURANT'))
    return { category: 'Supplies', subcategory: 'Webstaurant Store', is_personal: false }

  // FUEL
  if (m.includes('EXXON') || m.includes('CHEVRON') || m.includes('CIRCLE K'))
    return { category: 'Fuel', subcategory: 'Gas Station', is_personal: false }

  // UTILITIES
  if (m.includes('ROCKYMTN/PACIFIC') || m.includes('POWER BILL'))
    return { category: 'Utilities', subcategory: 'Electric (Rocky Mtn)', is_personal: false }

  // RENT / LOAN
  if (m.includes('PL*AFFORDABLEFOO') || m.includes('PL*PAYLEASE') || m.includes('AFFORDABLEFOO'))
    return { category: 'Rent', subcategory: 'Lincoln City (The Pines)', is_personal: false }
  if (m.includes('BMO BANK'))
    return { category: 'Loan Payment', subcategory: 'BMO Bank Loan', is_personal: false }
  if (m.includes('HMF') || m.includes('HMFUSA'))
    return { category: 'Loan Payment', subcategory: 'HMF Loan', is_personal: false }
  if (m.includes('CC-94 NEWPORT') || m.includes('CC94 NEWPORT'))
    return { category: 'Rent', subcategory: 'Newport Location', is_personal: false }

  // INSURANCE
  if (m.includes('RED SHIELD INSUR'))
    return { category: 'Insurance', subcategory: 'Red Shield Insurance', is_personal: false }

  // SUPPLIES
  if (m.includes('WAL-MART') || m.includes('WM SUPERCENTER') || m.includes('WALMART'))
    return { category: 'Supplies', subcategory: 'Walmart', is_personal: false }
  if (m.includes('AMAZON'))
    return { category: 'Supplies', subcategory: 'Amazon', is_personal: false }
  if (m.includes('MILLS ACE HARDWARE'))
    return { category: 'Supplies', subcategory: 'Ace Hardware', is_personal: false }
  if (m.includes('FRED-MEYER') || m.includes('FRED MEYER'))
    return { category: 'Supplies', subcategory: 'Fred Meyer', is_personal: false }
  if (m.includes('GROCERY OUTLET'))
    return { category: 'Supplies', subcategory: 'Grocery Outlet', is_personal: false }
  if (m.includes('SAFEWAY'))
    return { category: 'Supplies', subcategory: 'Safeway', is_personal: false }
  if (m.includes('VEVOR'))
    return { category: 'Supplies', subcategory: 'Vevor Equipment', is_personal: false }
  if (m.includes('U-HAUL'))
    return { category: 'Supplies', subcategory: 'U-Haul Rental', is_personal: false }

  // SOFTWARE / TECH
  if (m.includes('ANTHROPIC') || m.includes('CLAUDE.AI'))
    return { category: 'Software', subcategory: 'Anthropic/Claude AI', is_personal: false }
  if (m.includes('NAME-CHEAP') || m.includes('NAMECHEAP'))
    return { category: 'Software', subcategory: 'Namecheap (Domain)', is_personal: false }
  if (m.includes('GOOGLE') && m.includes('CAPCUT'))
    return { category: 'Software', subcategory: 'CapCut Video', is_personal: false }
  if (m.includes('APPLE.COM/BILL'))
    return { category: 'Software', subcategory: 'Apple Subscription', is_personal: false }
  if (m.includes('MYCREATIVE'))
    return { category: 'Software', subcategory: 'Creative Design', is_personal: false }

  // MARKETING / BUSINESS
  if (m.includes('LINCOLN CITY CHAMBE'))
    return { category: 'Marketing', subcategory: 'Lincoln City Chamber', is_personal: false }
  if (m.includes('OR SEC STATE CORPDI'))
    return { category: 'Business Fees', subcategory: 'Oregon Corp Filing', is_personal: false }
  if (m.includes('LINCOLN CO HHS'))
    return { category: 'Business Fees', subcategory: 'Lincoln Co Health Permit', is_personal: false }
  if (m.includes('STATEFOODSAFETY'))
    return { category: 'Business Fees', subcategory: 'Food Safety Certification', is_personal: false }
  if (m.includes('PACIFIC DIGITAL'))
    return { category: 'Marketing', subcategory: 'Pacific Digital', is_personal: false }

  // BANKING FEES
  if (m.includes('WAFD BANK') || m.includes('WA FEDERAL BANK') || m.includes('WAFDBANKB'))
    return { category: 'Bank Fees', subcategory: 'WaFd Bank Fee', is_personal: false }
  if (m.includes('PAI ATM'))
    return { category: 'Bank Fees', subcategory: 'ATM Withdrawal', is_personal: false }
  if (m.includes('INSUFFICIENT FUNDS'))
    return { category: 'Bank Fees', subcategory: 'NSF Fee', is_personal: false }

  // PERSONAL
  if (m.includes('THE HUMAN BEAN') || m.includes('THEHUMANB'))
    return { category: 'Personal', subcategory: 'Human Bean (Coffee)', is_personal: true }
  if (m.includes('MCDONALDS') || m.includes('DOMINOS') || m.includes('COBBLESTONE PIZZA') ||
      m.includes('PANERA') || m.includes('CHICK-FIL-A') || m.includes('SUPER OSCARS') ||
      m.includes('PATEMACS BBQ') || m.includes('GABIS HOT') || m.includes('CAMP ONE COFFEE') ||
      m.includes('PASTATASTIC') || m.includes('NW HAWAIIAN'))
    return { category: 'Personal', subcategory: 'Meals', is_personal: true }
  if (m.includes('VENMO'))
    return { category: 'Personal', subcategory: 'Venmo Transfer', is_personal: true }
  if (m.includes('SAVAGEXFENTY') || m.includes('ONEPIECEAPPAREL') || m.includes('NIKEPOS') ||
      m.includes('ALIEXPRESS') || m.includes('PERFECT LOOK') || m.includes('TARGET'))
    return { category: 'Personal', subcategory: 'Personal Shopping', is_personal: true }

  // CHECK PAID / WITHDRAWAL — unknown
  if (description === 'Check Paid' || description === 'Withdrawal')
    return { category: 'Uncategorized', subcategory: 'Check/Withdrawal', is_personal: false }

  // DEPOSIT (non-Square)
  if (description === 'Deposit' || description === 'Misc Transaction')
    return { category: 'Other Income', subcategory: 'Misc Deposit', is_personal: false }

  return { category: 'Uncategorized', subcategory: '', is_personal: false }
}

// ─── Parse WaFd CSV ──────────────────────────────────────────────────────────
function parseWaFdCSV(text: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) ?? []
    if (cols.length < 7) continue
    const [accountNumber, , date, creditStr, debitStr, code, description, reference, memo = ''] = cols
    const credit = parseFloat(creditStr) || 0
    const debit  = parseFloat(debitStr)  || 0
    const { category, subcategory, is_personal } = categorize(memo, description, code)
    // parse date MM/DD/YYYY → YYYY-MM-DD
    const [m2, d, y] = date.split('/')
    rows.push({
      account_number: accountNumber,
      transaction_date: `${y}-${m2}-${d}`,
      credit_amount: credit,
      debit_amount: debit,
      code,
      description,
      reference: reference ?? '',
      memo,
      category,
      subcategory,
      is_personal,
    })
  }
  return rows
}

// ─── POST: upload CSV ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient()
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    const text = await file.text()
    const rows = parseWaFdCSV(text)
    if (rows.length === 0) return NextResponse.json({ error: 'No rows parsed' }, { status: 400 })

    const { data, error } = await sb
      .from('bank_transactions')
      .upsert(rows, { onConflict: 'transaction_date,credit_amount,debit_amount,memo,description', ignoreDuplicates: true })
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ imported: rows.length, message: `Imported ${rows.length} transactions` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── GET: fetch transactions ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end   = searchParams.get('end')

  let query = sb.from('bank_transactions').select('*').order('transaction_date', { ascending: false })
  if (start) query = query.gte('transaction_date', start)
  if (end)   query = query.lte('transaction_date', end)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── PATCH: update category ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const sb = createServerClient()
  const { id, category, subcategory, is_personal, notes } = await req.json()
  const { error } = await sb.from('bank_transactions').update({ category, subcategory, is_personal, notes }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
