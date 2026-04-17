'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { Search, CheckCircle, AlertTriangle } from 'lucide-react'

type PriceRow = {
  id: string
  code: string
  name: string
  kind: 'ingredient' | 'package'
  category?: string
  vendor_unit_desc?: string
  size_qty?: number
  size_unit?: string
  current_unit_cost: number | null
  sort_order?: number
}

const formatMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PricesAdminPage() {
  const [rows, setRows] = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'all' | 'missing' | 'ingredients' | 'packages'>('missing')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/unit-price', { cache: 'no-store' })
      const json = await res.json()
      const combined: PriceRow[] = [
        ...(json.ingredients || []).map((i: any) => ({
          id:                i.id,
          code:              i.code,
          name:              i.name,
          kind:              'ingredient' as const,
          category:          i.category,
          vendor_unit_desc:  i.vendor_unit_desc,
          current_unit_cost: i.current_unit_cost != null ? Number(i.current_unit_cost) : null,
          sort_order:        i.sort_order,
        })),
        ...(json.packages || []).map((p: any) => ({
          id:                p.id,
          code:              p.code,
          name:              p.name,
          kind:              'package' as const,
          size_qty:          p.size_qty,
          size_unit:         p.size_unit,
          current_unit_cost: p.current_unit_cost != null ? Number(p.current_unit_cost) : null,
          sort_order:        p.sort_order,
        })),
      ]
      setRows(combined)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const savePrice = async (row: PriceRow) => {
    const raw = drafts[row.code] ?? (row.current_unit_cost != null ? String(row.current_unit_cost) : '')
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
      setRows(prev => prev.map(r => r.code === row.code ? { ...r, current_unit_cost: value } : r))
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
    if (filter === 'missing')     out = out.filter(r => r.current_unit_cost == null)
    if (filter === 'ingredients') out = out.filter(r => r.kind === 'ingredient')
    if (filter === 'packages')    out = out.filter(r => r.kind === 'package')
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

  const missingCount = rows.filter(r => r.current_unit_cost == null).length
  const totalCount = rows.length

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Prices"
        sub="Unit prices for all ingredients and packages"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <div>
            <div className="text-xs text-gray-500">Priced</div>
            <div className="text-lg font-bold text-gray-800">{totalCount - missingCount} / {totalCount}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <div>
            <div className="text-xs text-gray-500">Missing price</div>
            <div className="text-lg font-bold text-gray-800">{missingCount}</div>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-gray-500 mb-1">Tip</div>
          <div className="text-xs text-gray-600">
            Prices are used on the Order List to estimate expected cost. Receipts will overwrite manual entries on next reconciliation.
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
            {([
              ['missing',     `Missing (${missingCount})`],
              ['all',         `All (${totalCount})`],
              ['ingredients', 'Ingredients'],
              ['packages',    'Packages'],
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
                <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                <th className="text-left px-4 py-2.5 font-semibold">Unit</th>
                <th className="text-right px-4 py-2.5 font-semibold">Current price</th>
                <th className="text-right px-4 py-2.5 font-semibold">New price</th>
                <th className="text-right px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(row => {
                const draft      = drafts[row.code] ?? ''
                const hasDraft   = draft.trim() !== ''
                const isDifferent = hasDraft && Number(draft) !== row.current_unit_cost
                const isSaving   = savingCode === row.code

                return (
                  <tr key={`${row.kind}-${row.code}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{row.code}</td>
                    <td className="px-4 py-2.5 text-gray-800">{row.name}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${
                        row.kind === 'ingredient'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-purple-50 text-purple-700'
                      }`}>
                        {row.kind === 'ingredient' ? (row.category || 'Ingredient') : 'Package'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {row.kind === 'ingredient'
                        ? (row.vendor_unit_desc || '—')
                        : (row.size_qty != null ? `${row.size_qty} ${row.size_unit || ''}`.trim() : '—')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.current_unit_cost != null
                        ? <span className="font-semibold text-gray-800">{formatMoney(row.current_unit_cost)}</span>
                        : <span className="text-amber-600 flex items-center gap-1 justify-end text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" /> Not set
                          </span>
                      }
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
                          onKeyDown={e => {
                            if (e.key === 'Enter') savePrice(row)
                          }}
                          placeholder={row.current_unit_cost != null ? String(row.current_unit_cost) : '0.00'}
                          className="w-24 text-right text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>
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
