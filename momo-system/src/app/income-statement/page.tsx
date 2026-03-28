'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { DollarSign, TrendingUp, TrendingDown, Plus, Trash2, RefreshCw, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const EXPENSE_CATEGORIES = ['Rent','Fuel','Repairs','Supplies','Insurance','Loan Payment','Utilities','Marketing','Other']

const PRESETS = [
  { label: 'This Week',  getRange: () => ({ start: format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'), end: format(endOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd') }) },
  { label: 'Last Week',  getRange: () => ({ start: format(startOfWeek(subWeeks(new Date(),1),{weekStartsOn:1}),'yyyy-MM-dd'), end: format(endOfWeek(subWeeks(new Date(),1),{weekStartsOn:1}),'yyyy-MM-dd') }) },
  { label: 'This Month', getRange: () => ({ start: format(startOfMonth(new Date()),'yyyy-MM-dd'), end: format(endOfMonth(new Date()),'yyyy-MM-dd') }) },
  { label: 'Last Month', getRange: () => ({ start: format(startOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd'), end: format(endOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd') }) },
]

function fmt$(n: number) { return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')}` }
function pct(n: number, total: number) { return total > 0 ? `${(n/total*100).toFixed(1)}%` : '0%' }

export default function IncomeStatementPage() {
  const [locationView, setLocationView] = useState<'lc'|'salem'|'combined'>('lc')
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [activePreset, setActivePreset] = useState('This Week')
  const [loading, setLoading] = useState(false)
  const [squareLocations, setSquareLocations] = useState<any[]>([])
  const [squareMapping, setSquareMapping] = useState<Record<string,string>>({}) // appLocationId -> squareLocationId
  const [showMapping, setShowMapping] = useState(false)
  const [salesData, setSalesData] = useState<any>(null)
  const [expenses, setExpenses] = useState<any[]>([])
  const [cogsData, setCogsData] = useState<number>(0)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [newExpense, setNewExpense] = useState({ expense_date: format(new Date(),'yyyy-MM-dd'), category:'Rent', amount:'', notes:'', location_id:'' })
  const [appLocations, setAppLocations] = useState<any[]>([])

  useEffect(() => {
    // Load app locations and Square locations
    Promise.all([
      supabase.from('locations').select('*').eq('type','food_truck'),
      supabase.from('square_locations').select('*'),
      fetch('/api/square?action=locations').then(r=>r.json())
    ]).then(([appLocs, savedMapping, squareLocs]) => {
      setAppLocations(appLocs.data||[])
      // Build mapping from saved data
      const mapping: Record<string,string> = {}
      for (const m of savedMapping.data||[]) {
        if (m.app_location_id) mapping[m.app_location_id] = m.square_location_id
      }
      setSquareMapping(mapping)
      if (squareLocs.locations) setSquareLocations(squareLocs.locations)
    })
  }, [])

  const saveMapping = async (appLocId: string, squareLocId: string) => {
    const appLoc = appLocations.find(l => l.id === appLocId)
    await supabase.from('square_locations').upsert({
      square_location_id: squareLocId,
      square_name: squareLocations.find(l=>l.id===squareLocId)?.name || '',
      app_location_id: appLocId
    }, { onConflict: 'square_location_id' })
    setSquareMapping(prev => ({ ...prev, [appLocId]: squareLocId }))
    toast.success(`${appLoc?.name} mapped to Square location!`)
  }

  const getSquareLocationIds = () => {
    if (locationView === 'combined') return Object.values(squareMapping)
    const appLoc = appLocations.find(l =>
      locationView === 'lc' ? l.name.includes('Lincoln') : l.name.includes('Salem')
    )
    return appLoc ? [squareMapping[appLoc.id]].filter(Boolean) : []
  }

  const [laborCost, setLaborCost] = useState(0)
  const [laborWages, setLaborWages] = useState(0)
  const [laborTaxes, setLaborTaxes] = useState(0)
  const [loanRepayment, setLoanRepayment] = useState(0)
  const [processingFees, setProcessingFees] = useState(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    const squareIds = getSquareLocationIds()

    // Fetch sales breakdown per Square location
    let totalGross = 0
    let totalNetSales = 0
    let totalTips = 0
    let totalRefunds = 0
    let totalProcessingFees = 0
    let orderCount = 0

    for (const sqId of squareIds) {
      if (!sqId) continue
      try {
        const salesRes = await fetch(`/api/square?action=sales&square_location_id=${sqId}&start_date=${startDate}&end_date=${endDate}`)
        if (salesRes.ok) {
          const data = await salesRes.json()
          totalGross += data.grossSales || 0
          totalNetSales += data.netSales || 0
          totalTips += data.tipTotal || 0
          totalRefunds += data.refunds || 0
          totalProcessingFees += data.processingFees || 0
          orderCount += data.orderCount || 0
        }
      } catch(e) { console.log('Sales data error:', e) }
    }

    setProcessingFees(totalProcessingFees)
    setSalesData({
      totalGross,
      totalRefunds,
      totalTips,
      netSales: totalNetSales,
      orderCount
    })

    // Get COGS from confirmed receipts
    try {
      const { data: receiptLines } = await supabase
        .from('receipt_line_items')
        .select('total_price, receipts!inner(receipt_date)')
        .eq('status','confirmed')
        .gte('receipts.receipt_date', startDate)
        .lte('receipts.receipt_date', endDate)
      const cogs = receiptLines?.reduce((s:number,l:any)=>s+(Number(l.total_price)||0),0)||0
      setCogsData(cogs)
    } catch(e) { console.log('COGS error:', e) }

    // Get labor from Square timecards
    try {
      const laborRes = await fetch(`/api/square?action=payroll&start_date=${startDate}&end_date=${endDate}`)
      if (laborRes.ok) {
        const laborData = await laborRes.json()
        setLaborCost(laborData.totalLaborCost || 0)
        setLaborWages(laborData.totalWages || 0)
        setLaborTaxes(laborData.estimatedTaxes || 0)
      }
    } catch(e) { console.log('Labor data not available:', e) }

    // Get loan repayments from Square
    try {
      const loanRes = await fetch(`/api/square?action=loans&start_date=${startDate}&end_date=${endDate}`)
      if (loanRes.ok) {
        const loanData = await loanRes.json()
        setLoanRepayment(loanData.loanRepayment || 0)
      }
    } catch(e) { console.log('Loan data not available:', e) }

    // Get processing fees from Square
    try {
      const feesRes = await fetch(`/api/square?action=processing-fees&start_date=${startDate}&end_date=${endDate}`)
      if (feesRes.ok) {
        const feesData = await feesRes.json()
        setProcessingFees(feesData.processingFees || 0)
      }
    } catch(e) { console.log('Processing fees not available:', e) }

    // Get manual expenses
    const appLoc = locationView === 'combined' ? null : appLocations.find((l:any) =>
      locationView === 'lc' ? l.name.includes('Lincoln') : l.name.includes('Salem')
    )
    const expUrl = `/api/manual-expenses?start_date=${startDate}&end_date=${endDate}${appLoc ? `&location_id=${appLoc.id}` : '&location_id=all'}`
    const expData = await fetch(expUrl).then(r=>r.json())
    setExpenses(Array.isArray(expData) ? expData : [])

    setLoading(false)
  }, [startDate, endDate, locationView, squareMapping, appLocations])

  useEffect(() => { loadData() }, [startDate, endDate, locationView])

  const addExpense = async () => {
    if (!newExpense.amount) return toast.error('Amount required')
    const appLoc = appLocations.find(l =>
      locationView === 'lc' ? l.name.includes('Lincoln') : l.name.includes('Salem')
    )
    const body = {
      ...newExpense,
      amount: Number(newExpense.amount),
      location_id: newExpense.location_id || appLoc?.id || null
    }
    const res = await fetch('/api/manual-expenses', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    })
    if (res.ok) {
      toast.success('Expense added!')
      setShowAddExpense(false)
      setNewExpense({ expense_date:format(new Date(),'yyyy-MM-dd'), category:'Rent', amount:'', notes:'', location_id:'' })
      loadData()
    } else toast.error('Failed to add expense')
  }

  const deleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    await fetch(`/api/manual-expenses?id=${id}`, { method:'DELETE' })
    toast.success('Deleted')
    loadData()
  }

  const totalManualExpenses = expenses.reduce((s,e)=>s+Number(e.amount),0)
  const totalExpenses = totalManualExpenses + laborCost + processingFees + loanRepayment
  const netSales = salesData?.netSales || 0
  const grossProfit = netSales - cogsData
  const netProfit = grossProfit - laborCost - processingFees - loanRepayment - totalManualExpenses
  const cogsPercent = pct(cogsData, netSales)
  const profitMargin = pct(netProfit, netSales)

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

      {/* Square Location Mapping */}
      {showMapping && (
        <Card className="mb-6 border-2 border-blue-200">
          <h3 className="font-semibold text-gray-900 mb-4">Map Square Locations to Food Trucks</h3>
          <div className="space-y-3">
            {appLocations.map(appLoc => (
              <div key={appLoc.id} className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700 w-48">{appLoc.name}</span>
                <select
                  value={squareMapping[appLoc.id]||''}
                  onChange={e => saveMapping(appLoc.id, e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- Select Square Location --</option>
                  {squareLocations.map(sl => (
                    <option key={sl.id} value={sl.id}>{sl.name} ({sl.address?.address_line_1})</option>
                  ))}
                </select>
                {squareMapping[appLoc.id] && <span className="text-green-500 text-sm">✓ Mapped</span>}
              </div>
            ))}
          </div>
          {squareLocations.length === 0 && (
            <p className="text-sm text-red-500 mt-2">⚠️ No Square locations found. Check your SQUARE_ACCESS_TOKEN in Vercel.</p>
          )}
        </Card>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        {/* Location toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[{v:'lc',l:'Lincoln City'},{v:'salem',l:'Salem'},{v:'combined',l:'Combined'}].map(({v,l}) => (
            <button key={v} onClick={() => setLocationView(v as any)}
              className={`px-4 py-2 text-sm font-medium transition-all ${
                locationView===v ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>{l}</button>
          ))}
        </div>

        {/* Preset buttons */}
        <div className="flex gap-2">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => { const r=p.getRange(); setStartDate(r.start); setEndDate(r.end); setActivePreset(p.label) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activePreset===p.label ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>{p.label}</button>
          ))}
        </div>

        {/* Custom range */}
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
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <p className="text-xs text-green-600 font-medium">Net Sales</p>
              <p className="text-2xl font-bold text-green-800 mt-1">{fmt$(netSales)}</p>
              <p className="text-xs text-green-500">{salesData?.orderCount||0} orders</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
              <p className="text-xs text-yellow-600 font-medium">Food Cost (COGS)</p>
              <p className="text-2xl font-bold text-yellow-800 mt-1">{fmt$(cogsData)}</p>
              <p className="text-xs text-yellow-500">{cogsPercent} of sales</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs text-blue-600 font-medium">Gross Profit</p>
              <p className="text-2xl font-bold text-blue-800 mt-1">{fmt$(grossProfit)}</p>
              <p className="text-xs text-blue-500">{pct(grossProfit,netSales)} margin</p>
            </div>
            <div className={`rounded-xl p-4 border ${netProfit>=0?'bg-brand-50 border-brand-100':'bg-red-50 border-red-100'}`}>
              <p className={`text-xs font-medium ${netProfit>=0?'text-brand-600':'text-red-600'}`}>Net Profit</p>
              <p className={`text-2xl font-bold mt-1 ${netProfit>=0?'text-brand-800':'text-red-800'}`}>{fmt$(netProfit)}</p>
              <p className={`text-xs ${netProfit>=0?'text-brand-500':'text-red-500'}`}>{profitMargin} margin</p>
            </div>
          </div>

          {/* Detailed P&L */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
            {/* Revenue */}
            <Card>
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" /> Revenue
              </h3>
              <div className="space-y-2">
                {[
                  { label:'Gross Sales',        val: salesData?.totalGross||0,        cls:'text-gray-800' },
                  { label:'Discounts & Comps',  val: -(salesData?.discountTotal||0),  cls:'text-gray-500' },
                  { label:'Tax',                val: -(salesData?.taxTotal||0),        cls:'text-gray-500' },
                  { label:'Tips (pass-through)',val: -(salesData?.totalTips||0),       cls:'text-gray-500' },
                  { label:'Refunds',            val: -(salesData?.totalRefunds||0),    cls:'text-red-600' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-gray-600">{r.label}</span>
                    <span className={`font-medium ${r.cls}`}>
                      {r.val < 0 ? '-' : ''}{fmt$(Math.abs(r.val))}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                  <span>Net Sales</span>
                  <span className="text-green-700">{fmt$(netSales)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {salesData?.orderCount||0} orders · Tips {fmt$(salesData?.totalTips||0)} distributed to staff
                </div>
              </div>
            </Card>

            {/* COGS */}
            <Card>
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-yellow-600" /> Cost of Goods Sold
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Food Cost (from receipts)</span>
                  <span className="font-medium text-yellow-700">{fmt$(cogsData)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>COGS % of Sales</span>
                  <span>{cogsPercent}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                  <span>Gross Profit</span>
                  <span className="text-blue-700">{fmt$(grossProfit)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Expenses */}
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

            {showAddExpense && (
              <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
                    <input type="date" value={newExpense.expense_date}
                      onChange={e=>setNewExpense(p=>({...p,expense_date:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
                    <select value={newExpense.category}
                      onChange={e=>setNewExpense(p=>({...p,category:e.target.value}))}
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
                    <input type="text" placeholder="Optional note" value={newExpense.notes}
                      onChange={e=>setNewExpense(p=>({...p,notes:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={()=>setShowAddExpense(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button onClick={addExpense} className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700">Add</button>
                </div>
              </div>
            )}

            {/* Auto-pulled expenses from Square */}
            {(laborCost > 0 || processingFees > 0 || loanRepayment > 0) && (
              <div className="space-y-1 mb-4 pb-4 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-400 uppercase mb-2">From Square</p>
                {laborCost > 0 && (
                  <>
                    <div className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Labor</span>
                        <span className="text-sm text-gray-600">Wages (from timecards)</span>
                      </div>
                      <span className="text-sm font-medium text-red-600">{fmt$(laborWages)}</span>
                    </div>
                    {laborTaxes > 0 && (
                      <div className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Labor</span>
                          <span className="text-sm text-gray-600">Payroll Taxes (est. 7.65%)</span>
                        </div>
                        <span className="text-sm font-medium text-red-600">{fmt$(laborTaxes)}</span>
                      </div>
                    )}
                  </>
                )}
                {processingFees > 0 && (
                  <div className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Fees</span>
                      <span className="text-sm text-gray-600">Square Processing Fees</span>
                    </div>
                    <span className="text-sm font-medium text-red-600">{fmt$(processingFees)}</span>
                  </div>
                )}
                {loanRepayment > 0 && (
                  <div className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Loan</span>
                      <span className="text-sm text-gray-600">Square Loan Repayment</span>
                    </div>
                    <span className="text-sm font-medium text-red-600">{fmt$(loanRepayment)}</span>
                  </div>
                )}
              </div>
            )}

            {expenses.length === 0 && laborCost === 0 && processingFees === 0 && loanRepayment === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No expenses recorded for this period. Add one above!</p>
            ) : expenses.length === 0 ? null : (
              <div className="space-y-1">
                {expenses.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{e.category}</span>
                      <span className="text-sm text-gray-600">{e.notes||'—'}</span>
                      <span className="text-xs text-gray-400">{e.expense_date}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-red-600">{fmt$(Number(e.amount))}</span>
                      <button onClick={()=>deleteExpense(e.id)} className="p-1 text-gray-300 hover:text-red-500 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-3 mt-2 border-t border-gray-200">
                  <span>Manual Expenses</span>
                  <span className="text-red-600">{fmt$(totalManualExpenses)}</span>
                </div>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold pt-3 mt-2 border-t-2 border-gray-200">
              <span>Total Operating Expenses</span>
              <span className="text-red-600">{fmt$(totalExpenses)}</span>
            </div>
          </Card>

          {/* Net Profit Summary */}
          <Card className={`border-2 ${netProfit>=0?'border-green-200 bg-green-50':'border-red-200 bg-red-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Net Profit / Loss</h3>
                <p className="text-sm text-gray-500">{startDate} to {endDate}</p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${netProfit>=0?'text-green-700':'text-red-700'}`}>
                  {netProfit < 0 ? '-' : ''}{fmt$(Math.abs(netProfit))}
                </p>
                <p className={`text-sm ${netProfit>=0?'text-green-600':'text-red-600'}`}>
                  {profitMargin} profit margin
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
