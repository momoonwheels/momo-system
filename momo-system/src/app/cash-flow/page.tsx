'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  Upload, TrendingUp, TrendingDown, DollarSign, RefreshCw,
  ChevronDown, ChevronRight, AlertCircle, CheckCircle, Edit2, X, Check
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Transaction {
  id: string
  transaction_date: string
  credit_amount: number
  debit_amount: number
  description: string
  memo: string
  category: string
  subcategory: string
  is_personal: boolean
  notes?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt$ = (n: number) => {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-$' : '$') + abs
}

const PRESETS = [
  { label: 'This Week',  getRange: () => ({ start: format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'), end: format(endOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd') }) },
  { label: 'Last Week',  getRange: () => ({ start: format(startOfWeek(subWeeks(new Date(),1),{weekStartsOn:1}),'yyyy-MM-dd'), end: format(endOfWeek(subWeeks(new Date(),1),{weekStartsOn:1}),'yyyy-MM-dd') }) },
  { label: 'This Month', getRange: () => ({ start: format(startOfMonth(new Date()),'yyyy-MM-dd'), end: format(endOfMonth(new Date()),'yyyy-MM-dd') }) },
  { label: 'Last Month', getRange: () => ({ start: format(startOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd'), end: format(endOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd') }) },
  { label: 'All Data',   getRange: () => ({ start: '2020-01-01', end: format(new Date(),'yyyy-MM-dd') }) },
]

// Operating expense categories (in order)
const OPERATING_OUT_CATS = [
  'Food Cost', 'Labor', 'Taxes', 'Rent', 'Utilities',
  'Fuel', 'Supplies', 'Insurance', 'Loan Payment',
  'Software', 'Marketing', 'Business Fees', 'Bank Fees', 'Other',
]

const ALL_CATEGORIES = ['Revenue', 'Other Income', ...OPERATING_OUT_CATS, 'Personal', 'Uncategorized']

const CAT_COLORS: Record<string, string> = {
  Revenue: 'bg-emerald-100 text-emerald-800',
  'Other Income': 'bg-teal-100 text-teal-800',
  'Food Cost': 'bg-orange-100 text-orange-800',
  Labor: 'bg-blue-100 text-blue-800',
  Taxes: 'bg-red-100 text-red-800',
  Rent: 'bg-purple-100 text-purple-800',
  Utilities: 'bg-yellow-100 text-yellow-800',
  Fuel: 'bg-amber-100 text-amber-800',
  Supplies: 'bg-cyan-100 text-cyan-800',
  Insurance: 'bg-indigo-100 text-indigo-800',
  'Loan Payment': 'bg-rose-100 text-rose-800',
  Software: 'bg-violet-100 text-violet-800',
  Marketing: 'bg-pink-100 text-pink-800',
  'Business Fees': 'bg-slate-100 text-slate-800',
  'Bank Fees': 'bg-gray-100 text-gray-800',
  Personal: 'bg-lime-100 text-lime-800',
  Uncategorized: 'bg-gray-100 text-gray-500',
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({ label, amount, isIncome, children, defaultOpen = false }: {
  label: string; amount: number; isIncome?: boolean; children?: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <span className="font-semibold text-gray-800 text-sm">{label}</span>
        </div>
        <span className={`font-bold text-sm ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
          {isIncome ? '+' : '-'}{fmt$(Math.abs(amount))}
        </span>
      </button>
      {open && <div className="divide-y divide-gray-50">{children}</div>}
    </div>
  )
}

// ─── Subcategory row ──────────────────────────────────────────────────────────
function SubRow({ label, amount, count }: { label: string; amount: number; count: number }) {
  return (
    <div className="flex items-center justify-between px-6 py-2 hover:bg-gray-50">
      <span className="text-sm text-gray-600">{label} <span className="text-xs text-gray-400">({count})</span></span>
      <span className="text-sm font-medium text-gray-800">{fmt$(amount)}</span>
    </div>
  )
}

// ─── Inline category editor ───────────────────────────────────────────────────
function CategoryBadge({ tx, onSave }: { tx: Transaction; onSave: (id: string, cat: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(tx.category)
  return editing ? (
    <div className="flex items-center gap-1">
      <select
        className="text-xs border border-gray-300 rounded px-1 py-0.5"
        value={val}
        onChange={e => setVal(e.target.value)}
      >
        {ALL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
      </select>
      <button onClick={() => { onSave(tx.id, val); setEditing(false) }} className="p-0.5 text-emerald-600 hover:text-emerald-700"><Check className="w-3 h-3" /></button>
      <button onClick={() => setEditing(false)} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
    </div>
  ) : (
    <div className="flex items-center gap-1 group">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[tx.category] ?? 'bg-gray-100 text-gray-500'}`}>
        {tx.category}
      </span>
      <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600">
        <Edit2 className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CashFlowPage() {
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate,   setEndDate]   = useState(() => format(endOfMonth(new Date()),   'yyyy-MM-dd'))
  const [activePreset, setActivePreset] = useState('This Month')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<'statement' | 'transactions'>('statement')
  const [dragOver, setDragOver] = useState(false)
  const [openingBalance, setOpeningBalance] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bank-transactions?start=${startDate}&end=${endDate}`)
      const data = await res.json()
      setTransactions(Array.isArray(data) ? data : [])
    } catch { toast.error('Failed to load transactions') }
    finally { setLoading(false) }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  const handlePreset = (p: typeof PRESETS[0]) => {
    const { start, end } = p.getRange()
    setStartDate(start); setEndDate(end); setActivePreset(p.label)
  }

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) { toast.error('Please upload a CSV file'); return }
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/bank-transactions', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(`✅ ${data.message}`)
      load()
    } catch { toast.error('Upload failed') }
    finally { setUploading(false) }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleCategoryChange = async (id: string, category: string) => {
    setTransactions(ts => ts.map(t => t.id === id ? { ...t, category } : t))
    await fetch('/api/bank-transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, category }),
    })
    toast.success('Category updated')
  }

  // ─── Compute cash flow ──────────────────────────────────────────────────────
  const businessTx = transactions.filter(t => !t.is_personal)
  const personalTx = transactions.filter(t => t.is_personal)

  // Cash In
  const revenueTx    = businessTx.filter(t => t.category === 'Revenue' || t.category === 'Other Income')
  const totalCashIn  = revenueTx.reduce((s, t) => s + Number(t.credit_amount), 0)

  // Cash Out by category
  const outByCategory: Record<string, { total: number; bySub: Record<string, { total: number; count: number }> }> = {}
  for (const cat of OPERATING_OUT_CATS) outByCategory[cat] = { total: 0, bySub: {} }

  for (const t of businessTx) {
    if (t.category === 'Revenue' || t.category === 'Other Income' || t.category === 'Uncategorized') continue
    if (!outByCategory[t.category]) outByCategory[t.category] = { total: 0, bySub: {} }
    const amt = Number(t.debit_amount)
    outByCategory[t.category].total += amt
    const sub = t.subcategory || 'Other'
    if (!outByCategory[t.category].bySub[sub]) outByCategory[t.category].bySub[sub] = { total: 0, count: 0 }
    outByCategory[t.category].bySub[sub].total += amt
    outByCategory[t.category].bySub[sub].count += 1
  }

  const totalCashOut = Object.values(outByCategory).reduce((s, c) => s + c.total, 0)
  const netCashFlow  = totalCashIn - totalCashOut
  const personalTotal = personalTx.reduce((s, t) => s + Number(t.debit_amount), 0)

  const uncatTx = businessTx.filter(t => t.category === 'Uncategorized')

  const opening = parseFloat(openingBalance) || 0
  const closing  = opening + netCashFlow

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Cash Flow"
        sub="Bank transactions & cash position"
        action={
          <div className="flex gap-2 items-center flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activePreset === p.label
                    ? 'bg-green-700 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >{p.label}</button>
            ))}
          </div>
        }
      />

      {/* Date range */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setActivePreset('') }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500 focus:border-transparent" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setActivePreset('') }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500 focus:border-transparent" />
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
        }`}
        onClick={() => document.getElementById('csv-input')?.click()}
      >
        <input id="csv-input" type="file" accept=".csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-green-700">
            <LoadingSpinner size="sm" /> <span className="text-sm font-medium">Importing transactions...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="w-6 h-6 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">Drop WaFd CSV here or click to upload</p>
            <p className="text-xs text-gray-400">Download from WaFd → History → Export. Duplicates are skipped automatically.</p>
          </div>
        )}
      </div>

      {/* Uncategorized alert */}
      {uncatTx.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{uncatTx.length} transactions</strong> need categorization.
            Switch to <button onClick={() => setTab('transactions')} className="underline font-semibold">Transactions tab</button> to review.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['statement', 'transactions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{t === 'statement' ? 'Cash Flow Statement' : 'All Transactions'}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : tab === 'statement' ? (
        // ─── CASH FLOW STATEMENT ────────────────────────────────────────────
        <div className="space-y-4">

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Cash In',  value: totalCashIn,  icon: TrendingUp,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Total Cash Out', value: totalCashOut, icon: TrendingDown,  color: 'text-red-600',     bg: 'bg-red-50' },
              { label: 'Net Cash Flow',  value: netCashFlow,  icon: DollarSign,   color: netCashFlow>=0?'text-emerald-600':'text-red-600', bg: netCashFlow>=0?'bg-emerald-50':'bg-red-50' },
              { label: 'Personal (excl)',value: personalTotal,icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label} className={`${bg} border-0`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs text-gray-500 font-medium">{label}</span>
                </div>
                <p className={`text-xl font-bold ${color}`}>{fmt$(value)}</p>
              </Card>
            ))}
          </div>

          {/* Opening/closing balance */}
          <Card>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">Opening Balance</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" value={openingBalance} placeholder="0.00"
                    onChange={e => setOpeningBalance(e.target.value)}
                    className="pl-7 pr-3 py-1.5 w-36 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
              <span className="text-gray-300">→</span>
              <div>
                <span className="text-sm text-gray-500">Net Change: </span>
                <span className={`text-sm font-bold ${netCashFlow>=0?'text-emerald-600':'text-red-600'}`}>{netCashFlow>=0?'+':''}{fmt$(netCashFlow)}</span>
              </div>
              <span className="text-gray-300">→</span>
              <div>
                <span className="text-sm text-gray-500">Closing Balance: </span>
                <span className={`text-sm font-bold ${closing>=0?'text-emerald-600':'text-red-600'}`}>{fmt$(closing)}</span>
              </div>
            </div>
          </Card>

          {/* Operating Activities */}
          <Card>
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Operating Activities
            </h3>
            <div className="space-y-2">
              {/* Cash In */}
              <Section label="Cash In — Square Revenue" amount={totalCashIn} isIncome defaultOpen>
                {Object.entries(
                  revenueTx.reduce((acc, t) => {
                    const sub = t.subcategory || t.description
                    if (!acc[sub]) acc[sub] = { total: 0, count: 0 }
                    acc[sub].total += Number(t.credit_amount)
                    acc[sub].count += 1
                    return acc
                  }, {} as Record<string, { total: number; count: number }>)
                ).sort((a, b) => b[1].total - a[1].total).map(([sub, { total, count }]) => (
                  <SubRow key={sub} label={sub} amount={total} count={count} />
                ))}
              </Section>

              {/* Cash Out by category */}
              {OPERATING_OUT_CATS.filter(cat => outByCategory[cat]?.total > 0).map(cat => (
                <Section key={cat} label={`${cat}`} amount={outByCategory[cat].total}>
                  {Object.entries(outByCategory[cat].bySub)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([sub, { total, count }]) => (
                      <SubRow key={sub} label={sub} amount={total} count={count} />
                    ))}
                </Section>
              ))}

              {/* Net operating */}
              <div className={`flex justify-between items-center px-4 py-3 rounded-lg font-bold text-sm mt-2 ${
                netCashFlow >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
              }`}>
                <span>Net Cash from Operations</span>
                <span>{netCashFlow >= 0 ? '+' : ''}{fmt$(netCashFlow)}</span>
              </div>
            </div>
          </Card>

          {/* Personal summary */}
          {personalTx.length > 0 && (
            <Card className="border-amber-100">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Personal Expenses <span className="text-xs font-normal text-gray-400">(excluded from business cash flow)</span>
              </h3>
              <div className="space-y-1">
                {Object.entries(
                  personalTx.reduce((acc, t) => {
                    const sub = t.subcategory || 'Other'
                    if (!acc[sub]) acc[sub] = { total: 0, count: 0 }
                    acc[sub].total += Number(t.debit_amount)
                    acc[sub].count += 1
                    return acc
                  }, {} as Record<string, { total: number; count: number }>)
                ).sort((a, b) => b[1].total - a[1].total).map(([sub, { total, count }]) => (
                  <SubRow key={sub} label={sub} amount={total} count={count} />
                ))}
                <div className="flex justify-between items-center px-4 py-2 bg-amber-50 rounded-lg text-sm font-bold text-amber-800 mt-1">
                  <span>Total Personal</span>
                  <span>{fmt$(personalTotal)}</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      ) : (
        // ─── TRANSACTIONS TABLE ─────────────────────────────────────────────
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Date','Description / Memo','Category','In','Out'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map(tx => (
                  <tr key={tx.id} className={`hover:bg-gray-50 ${tx.is_personal ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{tx.transaction_date}</td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <div className="text-xs font-medium text-gray-800 truncate">{tx.description}</div>
                      {tx.memo && <div className="text-xs text-gray-400 truncate">{tx.memo}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <CategoryBadge tx={tx} onSave={handleCategoryChange} />
                      {tx.subcategory && <div className="text-xs text-gray-400 mt-0.5">{tx.subcategory}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-emerald-600 whitespace-nowrap">
                      {Number(tx.credit_amount) > 0 ? fmt$(Number(tx.credit_amount)) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-red-600 whitespace-nowrap">
                      {Number(tx.debit_amount) > 0 ? fmt$(Number(tx.debit_amount)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && (
              <div className="py-16 text-center">
                <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No transactions yet. Upload a WaFd CSV above.</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
