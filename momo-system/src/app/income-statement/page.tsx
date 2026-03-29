'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, RefreshCw, Settings, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LaborEntry from '@/components/ui/LaborEntry'

const EXPENSE_CATEGORIES = ['Rent','Fuel','Repairs','Supplies','Insurance','Loan Payment','Utilities','Marketing','Other']

const PRESETS = [
  { label: 'This Week',  getRange: () => ({ start: format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'), end: format(endOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd') }) },
  { label: 'Last Week',  getRange: () => ({ start: format(startOfWeek(subWeeks(new Date(),1),{weekStartsOn:1}),'yyyy-MM-dd'), end: format(endOfWeek(subWeeks(new Date(),1),{weekStartsOn:1}),'yyyy-MM-dd') }) },
  { label: 'This Month', getRange: () => ({ start: format(startOfMonth(new Date()),'yyyy-MM-dd'), end: format(endOfMonth(new Date()),'yyyy-MM-dd') }) },
  { label: 'Last Month', getRange: () => ({ start: format(startOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd'), end: format(endOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd') }) },
]

function fmt$(n: number) {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-$' : '$') + abs
}
function pct(n: number, total: number) {
  return total > 0 ? (n / total * 100).toFixed(1) + '%' : '0%'
}

export default function IncomeStatementPage() {
  const [locationView, setLocationView] = useState<'lc'|'salem'|'combined'>('lc')
  const [startDate, setStartDate] = useState(format(startOfWeek(subWeeks(new Date(),0),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfWeek(subWeeks(new Date(),0),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [activePreset, setActivePreset] = useState('This Week')
  const [loading, setLoading] = useState(false)
  const [appLocations, setAppLocations] = useState<any[]>([])
  const [squareLocations, setSquareLocations] = useState<any[]>([])
  const [squareMapping, setSquareMapping] = useState<Record<string,string>>({})
  const [showMapping, setShowMapping] = useState(false)

  // Sales data
  const [salesData, setSalesData] = useState<any>(null)
  // COGS
  const [cogsData, setCogsData] = useState(0)
  // Expenses
  const [expenses, setExpenses] = useState<any[]>([])
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [newExpense, setNewExpense] = useState({ expense_date: format(new Date(),'yyyy-MM-dd'), category:'Rent', amount:'', notes:'' })
  // Labor - manual entry
  const [manualWages, setManualWages] = useState('')
  const [savedWages, setSavedWages] = useState(0)
  const [savingWages, setSavingWages] = useState(false)
  // Processing fees & loans from Square
  const [processingFees, setProcessingFees] = useState(0)
  const [loanRepayment, setLoanRepayment] = useState(0)

  useEffect(() => {
    Promise.all([
      supabase.from('locations').select('*').eq('type','food_truck').eq('active',true),
      supabase.from('square_locations').select('*'),
      fetch('/api/square?action=locations').then(r=>r.json()).catch(()=>({locations:[]}))
    ]).then(([appLocs, savedMapping, sqLocs]) => {
      setAppLocations(appLocs.data||[])
      const mapping: Record<string,string> = {}
      for (const m of savedMapping.data||[]) {
        if (m.app_location_id) mapping[m.app_location_id] = m.square_location_id
      }
      setSquareMapping(mapping)
      if (sqLocs.locations) setSquareLocations(sqLocs.locations)
    })
  }, [])

  const getSquareIds = useCallback(() => {
    if (locationView === 'combined') return Object.values(squareMapping)
    const appLoc = appLocations.find(l =>
      locationView === 'lc' ? l.name.includes('Lincoln') : l.name.includes('Salem')
    )
    return appLoc && squareMapping[appLoc.id] ? [squareMapping[appLoc.id]] : []
  }, [locationView, squareMapping, appLocations])

  const getAppLocId = useCallback(() => {
    if (locationView === 'combined') return null
    return appLocations.find(l =>
      locationView === 'lc' ? l.name.includes('Lincoln') : l.name.includes('Salem')
    )?.id || null
  }, [locationView, appLocations])

  const loadData = useCallback(async () => {
    setLoading(true)
    const sqIds = getSquareIds()

    // ── Sales from Square ──────────────────────────────────────────
    let totalGross = 0, totalNet = 0, totalTips = 0, totalDiscount = 0, totalRefunds = 0, totalOrders = 0

    for (const sqId of sqIds) {
      try {
        const res = await fetch(`/api/square?action=sales&square_location_id=${sqId}&start_date=${startDate}&end_date=${endDate}`)
        if (res.ok) {
          const d = await res.json()
          totalGross += d.grossSales || 0
          totalNet += d.netSales || 0
          totalTips += d.tipTotal || 0
          totalDiscount += d.discountTotal || 0
          totalRefunds += d.refunds || 0
          totalOrders += d.orderCount || 0
        }
      } catch(e) { console.error('Sales error:', e) }
    }
    setSalesData({ grossSales: totalGross, netSales: totalNet, tipTotal: totalTips, discountTotal: totalDiscount, refunds: totalRefunds, orderCount: totalOrders })

    // ── COGS from receipts ─────────────────────────────────────────
    try {
      const { data: lines } = await supabase
        .from('receipt_line_items')
        .select('total_price, receipts!inner(receipt_date)')
        .eq('status','confirmed')
        .gte('receipts.receipt_date', startDate)
        .lte('receipts.receipt_date', endDate)
      setCogsData(lines?.reduce((s:number,l:any)=>s+(Number(l.total_price)||0),0)||0)
    } catch(e) { console.error('COGS error:', e) }

    // ── Processing fees from Square payouts ────────────────────────
    try {
      const res = await fetch(`/api/square?action=processing-fees&start_date=${startDate}&end_date=${endDate}`)
      if (res.ok) {
        const d = await res.json()
        setProcessingFees(d.processingFees || 0)
      }
    } catch(e) {}

    // ── Loan from Square payouts ───────────────────────────────────
    try {
      const res = await fetch(`/api/square?action=loans&start_date=${startDate}&end_date=${endDate}`)
      if (res.ok) {
        const d = await res.json()
        setLoanRepayment(d.loanRepayment || 0)
      }
    } catch(e) {}

    // ── Manual expenses ────────────────────────────────────────────
    try {
      const appLocId = getAppLocId()
      const url = `/api/manual-expenses?start_date=${startDate}&end_date=${endDate}${appLocId ? `&location_id=${appLocId}` : '&location_id=all'}`
      const d = await fetch(url).then(r=>r.json())
      setExpenses(Array.isArray(d) ? d : [])
    } catch(e) {}

    // ── Saved wages for this period ────────────────────────────────
    try {
      const { data } = await supabase
        .from('manual_expenses')
        .select('amount')
        .eq('category','__labor_wages__')
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
      const total = data?.reduce((s,r)=>s+(Number(r.amount)||0),0) || 0
      setSavedWages(total)
      if (total > 0) setManualWages(total.toFixed(2))
    } catch(e) {}

    setLoading(false)
  }, [startDate, endDate, getSquareIds, getAppLocId])

  useEffect(() => { loadData() }, [startDate, endDate, locationView])

  const saveWages = async () => {
    const amount = Number(manualWages)
    if (!amount) return toast.error('Enter wage amount')
    setSavingWages(true)
    // Delete existing wage entries for this period then insert new
    await supabase.from('manual_expenses')
      .delete()
      .eq('category','__labor_wages__')
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
    await supabase.from('manual_expenses').insert({
      category: '__labor_wages__',
      amount,
      expense_date: startDate,
      notes: `Labor wages ${startDate} to ${endDate}`
    })
    setSavedWages(amount)
    toast.success('Wages saved!')
    setSavingWages(false)
  }

  const addExpense = async () => {
    if (!newExpense.amount) return toast.error('Amount required')
    const appLocId = getAppLocId()
    const res = await fetch('/api/manual-expenses', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...newExpense, amount: Number(newExpense.amount), location_id: appLocId })
    })
    if (res.ok) {
      toast.success('Expense added!')
      setShowAddExpense(false)
      setNewExpense({ expense_date:format(new Date(),'yyyy-MM-dd'), category:'Rent', amount:'', notes:'' })
      loadData()
    }
  }

  const deleteExpense = async (id: string) => {
    await fetch(`/api/manual-expenses?id=${id}`, { method:'DELETE' })
    toast.success('Deleted')
    loadData()
  }

  const saveMapping = async (appLocId: string, sqLocId: string) => {
    await supabase.from('square_locations').upsert({
      square_location_id: sqLocId,
      square_name: squareLocations.find(l=>l.id===sqLocId)?.name || '',
      app_location_id: appLocId
    }, { onConflict: 'square_location_id' })
    setSquareMapping(prev => ({ ...prev, [appLocId]: sqLocId }))
    toast.success('Mapped!')
  }

  // Calculations
  const netSales = salesData?.netSales || 0
  const estimatedTaxes = savedWages * 0.0765
  const totalLaborCost = savedWages + estimatedTaxes
  const totalManualExpenses = expenses.filter(e=>e.category!=='__labor_wages__').reduce((s,e)=>s+Number(e.amount),0)
  const grossProfit = netSales - cogsData
  const totalExpenses = totalLaborCost + processingFees + loanRepayment + totalManualExpenses
  const netProfit = grossProfit - totalExpenses

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Income Statement"
        sub="Revenue, COGS, and expenses in one view"
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowMapping(!showMapping)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
              <Settings className="w-4 h-4" /> Square Setup
            </button>
            <button onClick={loadData}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      {/* Square Mapping */}
      {showMapping && (
        <Card className="mb-6 border-2 border-blue-200">
          <h3 className="font-semibold text-gray-900 mb-4">Map Square Locations to Food Trucks</h3>
          <div className="space-y-3">
            {appLocations.map(loc => (
              <div key={loc.id} className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700 w-48">{loc.name}</span>
                <select value={squareMapping[loc.id]||''} onChange={e => saveMapping(loc.id, e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- Select Square Location --</option>
                  {squareLocations.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                </select>
                {squareMapping[loc.id] && <span className="text-green-500 text-sm">✓ Mapped</span>}
              </div>
            ))}
            {squareLocations.length === 0 && <p className="text-sm text-red-500">⚠️ No Square locations found. Check SQUARE_ACCESS_TOKEN.</p>}
          </div>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[{v:'lc',l:'Lincoln City'},{v:'salem',l:'Salem'},{v:'combined',l:'Combined'}].map(({v,l}) => (
            <button key={v} onClick={() => setLocationView(v as any)}
              className={`px-3 py-2 text-sm font-medium transition-all ${locationView===v ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => { const r=p.getRange(); setStartDate(r.start); setEndDate(r.end); setActivePreset(p.label) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${activePreset===p.label ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={startDate} onChange={e=>{setStartDate(e.target.value);setActivePreset('')}}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-gray-400">to</span>
          <input type="date" value={endDate} onChange={e=>{setEndDate(e.target.value);setActivePreset('')}}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label:'Net Sales', value:fmt$(netSales), sub:`${salesData?.orderCount||0} orders`, color:'green' },
              { label:'Food Cost (COGS)', value:fmt$(cogsData), sub:`${pct(cogsData,netSales)} of sales`, color:'yellow' },
              { label:'Gross Profit', value:fmt$(grossProfit), sub:`${pct(grossProfit,netSales)} margin`, color:'blue' },
              { label:'Net Profit', value:fmt$(netProfit), sub:`${pct(netProfit,netSales)} margin`, color: netProfit>=0?'brand':'red' },
            ].map(k => (
              <div key={k.label} className={`rounded-xl p-4 border ${
                k.color==='green'?'bg-green-50 border-green-100':
                k.color==='yellow'?'bg-yellow-50 border-yellow-100':
                k.color==='blue'?'bg-blue-50 border-blue-100':
                k.color==='red'?'bg-red-50 border-red-100':
                'bg-brand-50 border-brand-100'}`}>
                <p className="text-xs font-medium text-gray-500">{k.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{k.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue + COGS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" /> Revenue
              </h3>
              <div className="space-y-2">
                {[
                  { label:'Gross Sales', val: salesData?.grossSales||0 },
                  { label:'Discounts & Comps', val: -(salesData?.discountTotal||0), cls:'text-gray-500' },
                  { label:'Tax', val: 0, cls:'text-gray-500' },
                  { label:'Tips (pass-through)', val: -(salesData?.tipTotal||0), cls:'text-gray-500' },
                  { label:'Refunds', val: -(salesData?.refunds||0), cls:'text-red-500' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-gray-600">{r.label}</span>
                    <span className={r.cls||'text-gray-800'}>{fmt$(r.val)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                  <span>Net Sales</span>
                  <span className="text-green-700">{fmt$(netSales)}</span>
                </div>
                <p className="text-xs text-gray-400">{salesData?.orderCount||0} payments · Tips {fmt$(salesData?.tipTotal||0)} distributed to staff</p>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-yellow-600" /> Cost of Goods Sold
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Food Cost (confirmed receipts)</span>
                  <span className="font-medium text-yellow-700">{fmt$(cogsData)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>COGS % of Sales</span>
                  <span>{pct(cogsData, netSales)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                  <span>Gross Profit</span>
                  <span className="text-blue-700">{fmt$(grossProfit)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Operating Expenses */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" /> Operating Expenses
              </h3>
              <button onClick={() => setShowAddExpense(!showAddExpense)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">
                <Plus className="w-3.5 h-3.5" /> Add Expense
              </button>
            </div>

            {/* Add Expense Form */}
            {showAddExpense && (
              <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
                    <input type="date" value={newExpense.expense_date}
                      onChange={e=>setNewExpense(p=>({...p,expense_date:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
                    <select value={newExpense.category} onChange={e=>setNewExpense(p=>({...p,category:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                      {EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Amount ($)</label>
                    <input type="number" step="0.01" placeholder="0.00" value={newExpense.amount}
                      onChange={e=>setNewExpense(p=>({...p,amount:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                    <input type="text" placeholder="Optional" value={newExpense.notes}
                      onChange={e=>setNewExpense(p=>({...p,notes:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={()=>setShowAddExpense(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button onClick={addExpense} className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg">Add</button>
                </div>
              </div>
            )}

            <LaborEntry
              startDate={startDate}
              endDate={endDate}
              savedWages={savedWages}
              onSaved={(wages) => { setSavedWages(wages); setManualWages(wages.toFixed(2)) }}
            />

            {/* Auto-pulled from Square */}
            {(processingFees > 0 || loanRepayment > 0) && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">From Square (auto)</p>
                {processingFees > 0 && (
                  <div className="flex justify-between py-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Fees</span>
                      <span className="text-gray-600">Square Processing Fees</span>
                    </div>
                    <span className="font-medium text-red-600">{fmt$(processingFees)}</span>
                  </div>
                )}
                {loanRepayment > 0 && (
                  <div className="flex justify-between py-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Loan</span>
                      <span className="text-gray-600">Square Loan Repayment</span>
                    </div>
                    <span className="font-medium text-red-600">{fmt$(loanRepayment)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Manual expenses */}
            {expenses.filter(e=>e.category!=='__labor_wages__').length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Other Expenses</p>
                {expenses.filter(e=>e.category!=='__labor_wages__').map(e => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{e.category}</span>
                      <span className="text-sm text-gray-600">{e.notes||'—'}</span>
                      <span className="text-xs text-gray-400">{e.expense_date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-red-600">{fmt$(Number(e.amount))}</span>
                      <button onClick={()=>deleteExpense(e.id)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between text-sm font-bold pt-3 border-t-2 border-gray-200">
              <span>Total Operating Expenses</span>
              <span className="text-red-600">{fmt$(totalExpenses)}</span>
            </div>
          </Card>

          {/* Net Profit */}
          <Card className={`border-2 ${netProfit>=0?'border-green-200 bg-green-50':'border-red-200 bg-red-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Net Profit / Loss</h3>
                <p className="text-sm text-gray-500">{startDate} to {endDate}</p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${netProfit>=0?'text-green-700':'text-red-700'}`}>
                  {fmt$(netProfit)}
                </p>
                <p className={`text-sm ${netProfit>=0?'text-green-600':'text-red-600'}`}>
                  {pct(netProfit, netSales)} profit margin
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
