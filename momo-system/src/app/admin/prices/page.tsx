'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { Search, CheckCircle, AlertTriangle, Receipt, Pencil } from 'lucide-react'

type PriceRow = {
  id: string
  code: string
  name: string
  category?: string
  vendor_unit_desc?: string
  effective_price: number | null
  effective_source: 'receipt' | 'manual' | null
  receipt_price: number | null
  receipt_date: string | null
  receipt_vendor: string | null
  manual_price: number | null
  sort_order?: number
}

const formatMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PricesAdminPage() {
  const [rows, setRows] = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'all' | 'missing' | 'receipt' | 'manual'>('missing')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/unit-price', { cache: 'no-store' })
      const json = await res.json()
      setRows(json.ingredients || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const savePrice = async (row: PriceRow) => {
    const raw = drafts[row.code] ?? (row.manual_price != null ? String(row.manual_price) : '')
    const trimmed = raw.trim()
    const value: number | null = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (isNaN(value) || value < 0)) {
      toast.error('Enter a valid non-negative number')
      return
    }
    setSavingCode(row.code)
    try {
      const res = await fetch('/api/unit-price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: row.code, current_unit_cost: value }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      // Update local row: manual_price changes, effective_price updates if there's no receipt
      setRows(prev => prev.map(r => {
        if (r.code !== row.code) return r
        const updated = { ...r, manual_price: value }
        // Receipts still win. If no receipt, effective becomes manual.
        if (r.receipt_price == null) {
          updated.effective_price = value && value > 0 ? value : null
          updated.effective_source = value && value > 0 ? 'manual' : null
        }
        return updated
      }))
      setDrafts(prev => {
        const next = { ...prev }
        delete next[row.code]
        return next
      })
      toast.success(`Saved ${row.code}`)
    } catch (e: any) {
      toast.error(e?.message || 'Save failed')
    } finally {
      setSavingCode(null)
    }
  }

  const filtered = useMemo(() => {
    let out = rows
    if (filter === 'missing') out = out.filter(r => r.effective_price == null)
    if (filter === 'receipt') out = out.filter(r => r.effective_source === 'receipt')
    if (filter === 'manual')  out = out.filter(r => r.effective_source === 'manual')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q)
      )
    }
    return out
  }, [rows, filter, search])

  const missingCount  = rows.filter(r => r.effective_price == null).length
  const receiptCount  = rows.filter(r => r.effective_source === 'receipt').length
  const manualCount   = rows.filter(r => r.effective_source === 'manual').length
  const totalCount    = rows.length

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Prices"
        sub="Ingredient unit prices — auto-pulled from receipts, with manual fallback"
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Card className="flex items-center gap-3">
          <Receipt className="w-5 h-5 text-green-500" />
          <div>
            <div className="text-xs text-gray-500">From receipts</div>
            <div className="text-lg font-bold text-gray-800">{receiptCount}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <Pencil className="w-5 h-5 text-amber-500" />
          <div>
            <div className="text-xs text-gray-500">Manual entry</div>
            <div className="text-lg font-bold text-gray-800">{manualCount}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <div>
            <div className="text-xs text-gray-500">Missing</div>
            <div className="text-lg font-bold text-gray-800">{missingCount}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-brand-600" />
          <div>
            <div className="text-xs text-gray-500">Total</div>
            <div className="text-lg font-bold text-gray-800">{totalCount}</div>
          </div>
        </Card>
      </div>

      <Card className="mb-4 text-xs text-gray-600">
        <strong className="text-gray-800">How this works:</strong> Prices are pulled from the latest matched receipt line for each ingredient. When no receipt exists yet, you can enter a manual price here — it'll be used until a receipt for that item is uploaded and reconciled. <strong>Receipts always override manual entries.</strong>
      </Card>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
            {([
              ['missing', `Missing (${missingCount})`],
              ['all',     `All (${totalCount})`],
              ['receipt', `From receipts (${receiptCount})`],
              ['manual',  `Manual (${manualCount})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === key ? 'bg-white shadow-sm text-brand-700' : 'text-gray-600 hover:text-gray-900'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, name, or category"
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">
          No items match the current filter.
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-900 text-white text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-semibold">Code</th>
                <th className="text-left px-4 py-2.5 font-semibold">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold">Category</th>
                <th className="text-left px-4 py-2.5 font-semibold">Unit</th>
                <th className="text-right px-4 py-2.5 font-semibold">Effective price</th>
                <th className="text-right px-4 py-2.5 font-semibold">Manual override</th>
                <th className="text-right px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(row => {
                const draft = drafts[row.code] ?? ''
                const hasDraft = draft.trim() !== ''
                const draftNum = hasDraft ? Number(draft) : null
                const isDifferent = hasDraft && draftNum !== row.manual_price
                const isSaving = savingCode === row.code

                return (
                  <tr key={row.code} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{row.code}</td>
                    <td className="px-4 py-2.5 text-gray-800">{row.name}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {row.category || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {row.vendor_unit_desc || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.effective_price != null ? (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="font-semibold text-gray-800">{formatMoney(row.effective_price)}</span>
                          {row.effective_source === 'receipt' ? (
                            <span title={`From receipt${row.receipt_date ? ' ' + row.receipt_date : ''}${row.receipt_vendor ? ' · ' + row.receipt_vendor : ''}`}>
                              <Receipt className="w-3.5 h-3.5 text-green-500" />
                            </span>
                          ) : (
                            <span title="Manual entry">
                              <Pencil className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-600 flex items-center gap-1 justify-end text-xs font-medium">
                          <AlertTriangle className="w-3 h-3" /> Not set
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <span className="text-gray-400 text-xs">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={draft}
                          onChange={e => setDrafts(prev => ({ ...prev, [row.code]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') savePrice(row) }}
                          placeholder={row.manual_price != null ? String(row.manual_price) : '0.00'}
                          className="w-24 text-right text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>
                      {row.receipt_price != null && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          Receipt: {formatMoney(row.receipt_price)}
                          {row.receipt_date && ` · ${row.receipt_date}`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => savePrice(row)}
                        disabled={!isDifferent || isSaving}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          isDifferent
                            ? 'bg-brand-600 text-white hover:bg-brand-700'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}>
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
