'use client'
import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ShoppingCart, Save, RotateCcw, Lock, CheckCircle, AlertTriangle, Minus, ChevronDown, ChevronRight, ShoppingBag } from 'lucide-react'

function snapToWednesday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day >= 3 ? day - 3 : day + 4
  d.setDate(d.getDate() - diff)
  return format(d, 'yyyy-MM-dd')
}

type Tab = 'order' | 'reconciliation'
type ShopStatus = 'full' | 'partial' | null

const SHOP_STATUS_KEY = (weekStart: string) => `shop_status_${weekStart}`

function loadShopStatus(weekStart: string): Record<string, ShopStatus> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(SHOP_STATUS_KEY(weekStart))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveShopStatus(weekStart: string, status: Record<string, ShopStatus>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SHOP_STATUS_KEY(weekStart), JSON.stringify(status))
}

export default function OrderListPage() {
  const [weekStart, setWeekStart]   = useState<string>(snapToWednesday)
  const [data, setData]             = useState<any>(null)
  const [loading, setLoading]       = useState(false)
  const [onHand, setOnHand]         = useState<Record<string,number>>({})
  const [saving, setSaving]         = useState(false)
  const [locking, setLocking]       = useState(false)
  const [tab, setTab]               = useState<Tab>('order')
  const [recon, setRecon]           = useState<any>(null)
  const [reconLoading, setReconLoading] = useState(false)
  const [notes, setNotes]           = useState<Record<string,string>>({})
  const [overallNotes, setOverallNotes] = useState('')
  const [expanded, setExpanded]     = useState<Record<string,boolean>>({})
  const [shopStatus, setShopStatus] = useState<Record<string, ShopStatus>>({})

  // Load shop status from localStorage when week changes
  useEffect(() => {
    setShopStatus(loadShopStatus(weekStart))
  }, [weekStart])

  const setItemStatus = (code: string, status: ShopStatus) => {
    const next = { ...shopStatus, [code]: status }
    setShopStatus(next)
    saveShopStatus(weekStart, next)
  }

  const load = useCallback(async () => {
    if (!weekStart) return
    setLoading(true)
    try {
      const res = await fetch(`/api/order-list?combined=true&week_start=${weekStart}`, { cache: 'no-store' })
      const json = await res.json()
      setData(json)
      const oh: Record<string,number> = {}
      for (const ing of json?.ingredients || []) {
        const line = (json?.lines || []).find((l: any) => l.code === ing.code)
        if (line) {
          const conv = Number(line.convFactor) || 1
          oh[ing.code] = conv > 0 ? (line.onHand != null ? Number(line.onHand) : 0) / conv : 0
        } else oh[ing.code] = 0
      }
      setOnHand(oh)
    } finally { setLoading(false) }
  }, [weekStart])

  const loadRecon = useCallback(async () => {
    if (!weekStart) return
    setReconLoading(true)
    try {
      const res = await fetch(`/api/order-lock?week_start=${weekStart}`, { cache: 'no-store' })
      const json = await res.json()
      setRecon(json)
      if (json.lock?.overall_notes) setOverallNotes(json.lock.overall_notes)
      const n: Record<string,string> = {}
      for (const item of json.items || []) {
        if (item.manager_notes) n[item.id] = item.manager_notes
      }
      setNotes(n)
    } finally { setReconLoading(false) }
  }, [weekStart])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'reconciliation') loadRecon() }, [tab, loadRecon])

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() + delta * 7)
    setWeekStart(format(d, 'yyyy-MM-dd'))
  }

  const saveOnHand = async () => {
    setSaving(true)
    const { supabase } = await import('@/lib/supabase')
    const ingData = data?.ingredients || []
    let failed = false
    for (const ing of ingData) {
      if (onHand[ing.code] === undefined) continue
      const val = onHand[ing.code] != null ? Number(onHand[ing.code]) : 0
      const { error } = await supabase.from('newport_inventory')
        .update({ quantity_on_hand: val }).eq('ingredient_id', ing.id)
      if (error) { console.error(ing.code, error); failed = true }
    }
    if (failed) toast.error('Some items failed to save')
    else toast.success('Inventory saved!')
    setSaving(false)
  }

  const resetAll = async () => {
    if (!confirm('Reset ALL on-hand (Newport + Truck) to zero?')) return
    const reset: Record<string,number> = {}
    Object.keys(onHand).forEach(k => { reset[k] = 0 })
    setOnHand(reset)
    try {
      await fetch('/api/truck-inventory/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: 'all' }),
      })
    } catch (e) { console.error(e) }
    toast.success('All on-hand reset to 0 — click Save to confirm Newport')
  }

  const lockOrder = async () => {
    if (!data?.lines?.length) { toast.error('No order data to lock'); return }
    if (!confirm(`Lock this order for week of ${weekStart}?`)) return
    setLocking(true)
    try {
      const lines = data.lines || []
      const ingMeta = (data.ingredients || []).reduce((acc: any, ing: any) => {
        acc[ing.code] = ing; return acc
      }, {})
      const items = lines.map((line: any) => {
        const ing = ingMeta[line.code] || {}
        const conv = Number(line.convFactor) || 1
        const recipeQty = Number(line.needed) || 0
        const vendorQty = conv > 0 ? Math.ceil(line.unitsToBuy || recipeQty / conv) : 0
        return {
          ingredient_code:        ing.code || line.code,
          ingredient_name:        ing.name || line.code,
          category:               ing.category || '',
          recipe_unit:            ing.recipe_unit || '',
          vendor_unit_desc:       ing.vendor_unit_desc || '',
          conv_factor:            conv,
          recommended_recipe_qty: recipeQty,
          recommended_vendor_qty: vendorQty,
        }
      })
      const res = await fetch('/api/order-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart, items }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success(`Order locked! ${json.items_saved} ingredients recorded.`)
      setTab('reconciliation')
    } catch (e: any) { toast.error(e.message) }
    finally { setLocking(false) }
  }

  const saveNote = async (itemId: string) => {
    await fetch('/api/order-lock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'item', item_id: itemId, manager_notes: notes[itemId] || '' }),
    })
    toast.success('Note saved')
  }

  const saveOverallNotes = async () => {
    if (!recon?.lock?.id) return
    await fetch('/api/order-lock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'overall', lock_id: recon.lock.id, overall_notes: overallNotes }),
    })
    toast.success('Notes saved')
  }

  const calcUnitsToBuy = (line: any) => {
    const needed = Number(line.needed) || 0
    const conv = Number(line.convFactor) || 1
    const minQty = Number(line.minOrderQty) || 1
    const currentOnHand = (onHand[line.code] || 0) * conv
    const netNeeded = Math.max(0, needed - currentOnHand)
    if (netNeeded <= 0) return 0
    const rawUnits = conv > 0 ? netNeeded / conv : 0
    return Math.max(minQty, Math.ceil(rawUnits / minQty) * minQty)
  }

  const lines = data?.lines || []
  const ingMeta = (data?.ingredients || []).reduce((acc: any, ing: any) => {
    acc[ing.code] = ing; return acc
  }, {})
  const grouped = lines.reduce((acc: Record<string,any[]>, line: any) => {
    const cat = ingMeta[line.code]?.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(line)
    return acc
  }, {})
  const totalToBuy = lines.filter((l: any) => calcUnitsToBuy(l) > 0).length

  // Shopping progress counts
  const toBuyLines = lines.filter((l: any) => calcUnitsToBuy(l) > 0)
  const doneCount = toBuyLines.filter((l: any) => shopStatus[l.code] === 'full').length
  const partialCount = toBuyLines.filter((l: any) => shopStatus[l.code] === 'partial').length

  const wedDate = new Date(weekStart + 'T12:00:00')
  const sunDate = new Date(wedDate); sunDate.setDate(wedDate.getDate() + 7)
  const weekLabel = `${format(wedDate, 'MMM d')} – ${format(sunDate, 'MMM d, yyyy')}`

  const getVarianceStatus = (recQty: number, actQty: number, conv: number) => {
    if (recQty === 0 && actQty === 0) return 'none'
    if (actQty === 0) return 'missing'
    const recVendor = conv > 0 ? recQty / conv : 0
    const actVendor = conv > 0 ? actQty / conv : 0
    const diff = Math.abs(recVendor - actVendor)
    const pct = recVendor > 0 ? diff / recVendor : 0
    if (pct <= 0.1) return 'ok'
    if (pct <= 0.25) return 'warn'
    return 'over'
  }

  const statusStyle = (s: string) => ({
    ok:      'bg-green-50 border-green-200',
    warn:    'bg-amber-50 border-amber-200',
    over:    'bg-red-50 border-red-200',
    missing: 'bg-red-50 border-red-200',
    none:    'bg-gray-50 border-gray-100',
  }[s] || 'bg-gray-50 border-gray-100')

  const statusIcon = (s: string) => {
    if (s === 'ok')      return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
    if (s === 'warn')    return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
    if (s === 'over')    return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
    if (s === 'missing') return <Minus className="w-4 h-4 text-red-400 flex-shrink-0" />
    return null
  }

  // Row background based on shop status
  const rowBg = (code: string, unitsToBuy: number) => {
    if (unitsToBuy === 0) return ''
    const s = shopStatus[code]
    if (s === 'full')    return 'bg-green-50'
    if (s === 'partial') return 'bg-amber-50'
    return 'bg-red-50'
  }

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Order List"
        sub="Newport — combined LC + Salem"
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg font-semibold">
              {totalToBuy} to order
            </span>
            <button onClick={resetAll}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
              <RotateCcw className="w-3.5 h-3.5" /> Reset All to 0
            </button>
            <button onClick={saveOnHand} disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={lockOrder} disabled={locking}
              className="flex items-center gap-2 px-4 py-1.5 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
              <Lock className="w-3.5 h-3.5" />
              {locking ? 'Locking...' : 'Lock Order'}
            </button>
          </div>
        }
      />

      {/* Week nav */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
          Newport (LC + Salem)
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input type="date" value={weekStart}
            onChange={e => {
              const d = new Date(e.target.value + 'T12:00:00')
              const day = d.getDay()
              const diff = day >= 3 ? day - 3 : day + 4
              d.setDate(d.getDate() - diff)
              setWeekStart(format(d, 'yyyy-MM-dd'))
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500"
          />
          <button onClick={() => shiftWeek(1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 bg-green-50 px-3 py-1.5 rounded-lg">
            {weekLabel}
            <span className="ml-2 text-xs text-gray-400">(LC: Wed–Sun · Salem: Thu–Wed)</span>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button onClick={() => setTab('order')}
          className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'order' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          Order List
        </button>
        <button onClick={() => setTab('reconciliation')}
          className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            tab === 'reconciliation' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          Reconciliation
          {recon?.locked && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
        </button>
      </div>

      {/* ── ORDER LIST TAB ── */}
      {tab === 'order' && (
        loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : !data ? null : (
          <div className="space-y-4">

            {/* Shopping progress bar */}
            {totalToBuy > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Shopping progress</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                      Fully bought: {doneCount}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                      Partial: {partialCount}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
                      Remaining: {totalToBuy - doneCount - partialCount}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="bg-green-500 h-full transition-all" style={{ width: `${(doneCount/totalToBuy)*100}%` }} />
                  <div className="bg-amber-400 h-full transition-all" style={{ width: `${(partialCount/totalToBuy)*100}%` }} />
                </div>
              </div>
            )}

            {(Object.entries(grouped) as [string,any[]][]).map(([category, catLines]) => (
              <Card key={category} className="p-0 overflow-hidden">
                <div className="px-4 py-2.5 bg-brand-900 text-white font-semibold text-sm flex justify-between">
                  <span>{category}</span>
                  <span className="text-brand-300 text-xs">
                    {catLines.filter(l => calcUnitsToBuy(l) > 0).length} to order
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {catLines.map((line: any) => {
                    const ing = ingMeta[line.code]
                    const needed = Number(line.needed) || 0
                    const conv = Number(line.convFactor) || 1
                    const currentOnHand = (onHand[line.code] || 0) * conv
                    const netNeeded = Math.max(0, needed - currentOnHand)
                    const unitsToBuy = calcUnitsToBuy(line)
                    const status = shopStatus[line.code]

                    return (
                      <div key={line.code} className={`px-4 py-3 transition-colors ${rowBg(line.code, unitsToBuy)}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-800 truncate">{ing?.name || line.code}</div>
                            <div className="text-xs text-gray-400">
                              {line.code} · needed: {needed.toFixed(1)} {ing?.recipe_unit}
                            </div>
                          </div>
                          {unitsToBuy > 0 ? (
                            <div className="flex-shrink-0 text-right">
                              <span className="text-sm font-bold text-white bg-brand-600 px-3 py-1 rounded-full">
                                Buy {unitsToBuy}
                              </span>
                              {ing?.vendor_unit_desc && (
                                <div className="text-xs text-gray-400 mt-0.5">{ing.vendor_unit_desc}</div>
                              )}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {/* On-hand input */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">On Hand:</span>
                            <input type="number" min="0" step="any" inputMode="decimal"
                              value={onHand[line.code] ?? 0}
                              onChange={e => setOnHand(prev => ({ ...prev, [line.code]: Number(e.target.value) }))}
                              className="w-20 text-center text-sm border border-green-200 bg-green-50 text-green-800 font-semibold rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <span className="text-xs text-gray-400">
                              {ing?.vendor_unit_desc ? ing.vendor_unit_desc.split('=')[0].trim().split(' ')[0] : ing?.recipe_unit}
                            </span>
                          </div>

                          {netNeeded > 0 && (
                            <span className="text-xs text-gray-500">need {netNeeded.toFixed(1)} {ing?.recipe_unit} more</span>
                          )}

                          {/* Shopping status buttons — only shown for items to buy */}
                          {unitsToBuy > 0 && (
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                onClick={() => setItemStatus(line.code, status === 'full' ? null : 'full')}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                  status === 'full'
                                    ? 'bg-green-500 text-white border-green-500'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-green-400 hover:text-green-600'
                                }`}>
                                ✓ Fully bought
                              </button>
                              <button
                                onClick={() => setItemStatus(line.code, status === 'partial' ? null : 'partial')}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                  status === 'partial'
                                    ? 'bg-amber-400 text-white border-amber-400'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400 hover:text-amber-600'
                                }`}>
                                ~ Partial
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            ))}

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <strong>Ready to order?</strong> Click <strong>Lock Order</strong> above to record what the system recommended.
              After ordering and uploading receipts, check the <strong>Reconciliation</strong> tab.
            </div>
          </div>
        )
      )}

      {/* ── RECONCILIATION TAB ── */}
      {tab === 'reconciliation' && (
        reconLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : !recon?.locked ? (
          <div className="text-center py-20">
            <Lock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No locked order for this week yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Go to the Order List tab, review the recommendations, then click Lock Order.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="font-semibold text-gray-900">Order locked</span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(recon.lock.locked_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {recon.items?.length} ingredients · week of {weekStart}
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Within 10%
                  </span>
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> 10–25% off
                  </span>
                  <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {'>'}25% off / missing
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Overall week notes</label>
              <textarea
                value={overallNotes}
                onChange={e => setOverallNotes(e.target.value)}
                onBlur={saveOverallNotes}
                placeholder="Any general notes about this week's ordering"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </Card>

            {(() => {
              const byCategory: Record<string, any[]> = {}
              for (const item of recon.items || []) {
                const cat = item.category || 'Other'
                if (!byCategory[cat]) byCategory[cat] = []
                byCategory[cat].push(item)
              }
              return Object.entries(byCategory).map(([cat, items]) => (
                <Card key={cat} className="p-0 overflow-hidden">
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-brand-900 text-white font-semibold text-sm">
                    <div className="flex items-center gap-2">
                      {expanded[cat] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {cat}
                    </div>
                    <span className="text-brand-300 text-xs">{(items as any[]).length} items</span>
                  </button>

                  {(expanded[cat] !== false) && (
                    <div className="divide-y divide-gray-50">
                      {(items as any[]).map((item: any) => {
                        const actual = recon.actual?.[item.ingredient_code]
                        const actRecipeQty = actual?.qty || 0
                        const conv = Number(item.conv_factor) || 1
                        const recVendorQty = item.recommended_vendor_qty
                        const actVendorQty = conv > 0 ? actRecipeQty / conv : 0
                        const status = getVarianceStatus(item.recommended_recipe_qty, actRecipeQty, conv)
                        const diff = actVendorQty - recVendorQty
                        const diffPct = recVendorQty > 0 ? ((diff / recVendorQty) * 100).toFixed(0) : null

                        return (
                          <div key={item.id} className={`p-4 border-l-4 ${statusStyle(status)}`}>
                            <div className="flex items-start gap-3">
                              {statusIcon(status)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                  <div>
                                    <span className="font-medium text-gray-900 text-sm">{item.ingredient_name}</span>
                                    <span className="ml-2 text-xs text-gray-400">{item.ingredient_code}</span>
                                  </div>
                                  {diffPct && (
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                      status === 'ok' ? 'bg-green-100 text-green-700' :
                                      status === 'warn' ? 'bg-amber-100 text-amber-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>
                                      {diff > 0 ? '+' : ''}{Number(diff.toFixed(1))} {item.vendor_unit_desc?.split('=')[0]?.trim()?.split(' ')[0] || item.recipe_unit}
                                      {diffPct && ` (${diff > 0 ? '+' : ''}${diffPct}%)`}
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-2">
                                  <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                    <div className="text-xs text-gray-400 mb-0.5">System recommended</div>
                                    <div className="text-base font-bold text-gray-900">
                                      {recVendorQty} <span className="text-sm font-normal text-gray-500">
                                        {item.vendor_unit_desc?.split('=')[0]?.trim()?.split(' ')[0] || 'units'}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-400">= {item.recommended_recipe_qty?.toFixed(1)} {item.recipe_unit}</div>
                                    {item.vendor_unit_desc && (
                                      <div className="text-xs text-gray-300 mt-0.5">{item.vendor_unit_desc}</div>
                                    )}
                                  </div>
                                  <div className={`rounded-lg p-2.5 border ${
                                    status === 'ok' ? 'bg-green-50 border-green-200' :
                                    status === 'warn' ? 'bg-amber-50 border-amber-200' :
                                    'bg-red-50 border-red-200'
                                  }`}>
                                    <div className="text-xs text-gray-400 mb-0.5">Actually bought</div>
                                    {actRecipeQty > 0 ? (
                                      <>
                                        <div className="text-base font-bold text-gray-900">
                                          {actVendorQty.toFixed(1)} <span className="text-sm font-normal text-gray-500">
                                            {item.vendor_unit_desc?.split('=')[0]?.trim()?.split(' ')[0] || 'units'}
                                          </span>
                                        </div>
                                        <div className="text-xs text-gray-400">= {actRecipeQty.toFixed(1)} {item.recipe_unit}</div>
                                        {actual?.lines?.map((l: any, i: number) => (
                                          <div key={i} className="text-xs text-gray-400 mt-0.5">{l.vendor} · {l.date}</div>
                                        ))}
                                      </>
                                    ) : (
                                      <div className="text-sm text-red-500 font-medium">No receipt found</div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2 items-start">
                                  <input
                                    type="text"
                                    placeholder="Manager notes"
                                    value={notes[item.id] || ''}
                                    onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    onBlur={() => saveNote(item.id)}
                                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>
              ))
            })()}
          </div>
        )
      )}
    </div>
  )
}
