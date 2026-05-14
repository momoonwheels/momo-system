'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ShoppingCart, Save, RotateCcw, Lock, CheckCircle, AlertTriangle, Minus, ChevronDown, ChevronRight, ShoppingBag, Pencil, Receipt } from 'lucide-react'

function snapToWednesday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day >= 3 ? day - 3 : day + 4
  d.setDate(d.getDate() - diff)
  return format(d, 'yyyy-MM-dd')
}

type Tab = 'order' | 'reconciliation'
type ShopStatus = 'full' | 'partial' | null
type PriceEntry = { unit_price: number; source: 'receipt' | 'manual'; last_receipt_date?: string }

const CATEGORY_ORDER = ['Protein', 'Produce', 'Dry Goods', 'Sauce', 'Oil', 'Spice', 'Pantry', 'Supplies', 'Overhead', 'Other']

const formatMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function OrderListPage() {
  const [weekStart, setWeekStart] = useState<string>(snapToWednesday)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [onHand, setOnHand] = useState<Record<string,number>>({})
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [tab, setTab] = useState<Tab>('order')
  const [recon, setRecon] = useState<any>(null)
  const [reconLoading, setReconLoading] = useState(false)
  const [notes, setNotes] = useState<Record<string,string>>({})
  const [overallNotes, setOverallNotes] = useState('')
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})

  // Shop status now lives in the DB and syncs across devices
  const [shopStatus, setShopStatus] = useState<Record<string, ShopStatus>>({})

  // Per-item buffer overrides — applied locally as soon as user saves so the
  // row recalculates immediately without waiting for a full refetch.
  const [bufferOverrides, setBufferOverrides] = useState<Record<string, number>>({})
  const [editingBuffer, setEditingBuffer] = useState<string | null>(null)
  const [bufferDraft, setBufferDraft] = useState<string>('')
  const bufferInputRef = useRef<HTMLInputElement>(null)

  // Price editing state
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState<string>('')
  // Local override for prices just saved (shown immediately, cleared on refetch)
  const [priceOverrides, setPriceOverrides] = useState<Record<string, PriceEntry>>({})
  const priceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingPrice && priceInputRef.current) {
      priceInputRef.current.focus()
      priceInputRef.current.select()
    }
  }, [editingPrice])

  useEffect(() => {
    if (editingBuffer && bufferInputRef.current) {
      bufferInputRef.current.focus()
      bufferInputRef.current.select()
    }
  }, [editingBuffer])

  // ── Shop status (DB-synced) ──────────────────────────────────────────────
  const loadShopStatus = useCallback(async (week: string) => {
    try {
      const res = await fetch(`/api/shop-status?week_start=${week}`, { cache: 'no-store' })
      if (!res.ok) { setShopStatus({}); return }
      const json = await res.json()
      setShopStatus(json.status || {})
    } catch {
      setShopStatus({})
    }
  }, [])

  useEffect(() => { loadShopStatus(weekStart) }, [weekStart, loadShopStatus])

  const setItemStatus = async (code: string, status: ShopStatus) => {
    // Optimistic update
    const prev = shopStatus
    const next = { ...shopStatus }
    if (status === null) delete next[code]
    else next[code] = status
    setShopStatus(next)
    try {
      const res = await fetch('/api/shop-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart, ingredient_code: code, status }),
      })
      if (!res.ok) {
        setShopStatus(prev) // rollback
        const j = await res.json().catch(() => ({}))
        toast.error(j.error || 'Save failed — others won\'t see this')
      }
    } catch (e: any) {
      setShopStatus(prev)
      toast.error(e?.message || 'Network error')
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

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
      setPriceOverrides({})
      setBufferOverrides({})
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
      for (const item of (json.items || []).filter((i: any) => i.recommended_vendor_qty > 0)) {
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
      const ingMetaMap = (data.ingredients || []).reduce((acc: any, ing: any) => {
        acc[ing.code] = ing; return acc
      }, {})
      const items = lines.map((line: any) => {
        const ing = ingMetaMap[line.code] || {}
        const conv = Number(line.convFactor) || 1
        const recipeQty = Number(line.needed) || 0
        const currentOnHand = (onHand[line.code] || 0) * conv
        const netNeeded = Math.max(0, recipeQty - currentOnHand)
        const minQty = Number(ing.min_order_qty) || 1
        const bufferPct = getBufferPct(line.code, ing)
        const buffered = netNeeded * (1 + bufferPct / 100)
        const vendorQty = netNeeded <= 0
          ? 0
          : Math.max(minQty, Math.ceil((buffered / conv) / minQty) * minQty)

        return {
          ingredient_code: ing.code || line.code,
          ingredient_name: ing.name || line.code,
          category: ing.category || '',
          recipe_unit: ing.recipe_unit || '',
          vendor_unit_desc: ing.vendor_unit_desc || '',
          conv_factor: conv,
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

  // Save manual price for a single item (inline edit)
  const savePriceFor = async (code: string, rawValue: string) => {
    const trimmed = rawValue.trim()
    const value: number | null = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (isNaN(value) || value < 0)) {
      toast.error('Enter a valid non-negative number')
      return
    }
    try {
      const res = await fetch('/api/unit-price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, current_unit_cost: value }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      if (value != null) {
        setPriceOverrides(prev => ({ ...prev, [code]: { unit_price: value, source: 'manual' } }))
      } else {
        setPriceOverrides(prev => { const next = { ...prev }; delete next[code]; return next })
      }
      setEditingPrice(null)
      setPriceDraft('')
      toast.success(`Price saved for ${code}`)
    } catch (e: any) {
      toast.error(e?.message || 'Save failed')
    }
  }

  // Save per-item buffer% (inline edit) — uses existing PUT /api/ingredients
  const saveBufferFor = async (code: string, rawValue: string) => {
    const trimmed = rawValue.trim()
    if (trimmed === '') { setEditingBuffer(null); setBufferDraft(''); return }
    const value = Number(trimmed)
    if (isNaN(value) || value < 0 || value > 1000) {
      toast.error('Enter a number between 0 and 1000')
      return
    }
    const ing = ingMeta[code]
    if (!ing?.id) { toast.error('Cannot find ingredient id'); return }
    try {
      const res = await fetch('/api/ingredients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ing.id, buffer_pct: value }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      setBufferOverrides(prev => ({ ...prev, [code]: value }))
      setEditingBuffer(null)
      setBufferDraft('')
      toast.success(`Buffer set to ${value}% for ${code}`)
    } catch (e: any) {
      toast.error(e?.message || 'Save failed')
    }
  }

  // Per-item buffer lookup: local override → server value from ingredients table → 0 fallback
  const getBufferPct = (code: string, ing?: any): number => {
    if (bufferOverrides[code] != null) return bufferOverrides[code]
    const fromServer = ing?.buffer_pct
    if (fromServer != null) return Number(fromServer)
    return 0
  }

  // calcUnitsToBuy: applies per-item buffer (replaces old global Newport buffer)
  const calcUnitsToBuy = (line: any, meta: Record<string, any>) => {
    const needed = Number(line.needed) || 0
    const conv = Number(line.convFactor) || 1
    const minQty = Number(line.minOrderQty) || 1
    const currentOnHand = (onHand[line.code] || 0) * conv
    const netNeeded = Math.max(0, needed - currentOnHand)
    if (netNeeded <= 0) return 0
    const bufferPct = getBufferPct(line.code, meta[line.code])
    const buffered = netNeeded * (1 + bufferPct / 100)
    const rawUnits = conv > 0 ? buffered / conv : 0
    return Math.max(minQty, Math.ceil(rawUnits / minQty) * minQty)
  }

  const lines = data?.lines || []
  const ingMeta = (data?.ingredients || []).reduce((acc: any, ing: any) => {
    acc[ing.code] = ing; return acc
  }, {})

  const priceMap: Record<string, PriceEntry> = data?.priceMap || {}

  // Unified lookup: session override → receipts/manual from server
  const getPriceEntry = (code: string): PriceEntry | null => {
    if (priceOverrides[code]) return priceOverrides[code]
    return priceMap[code] || null
  }
  const getUnitPrice = (code: string): number | null => {
    const e = getPriceEntry(code)
    return e ? e.unit_price : null
  }

  const calcLineCost = (line: any): number | null => {
    const units = calcUnitsToBuy(line, ingMeta)
    if (units === 0) return 0
    const price = getUnitPrice(line.code)
    return price != null ? units * price : null
  }

  const grouped = lines.reduce((acc: Record<string,any[]>, line: any) => {
    const cat = ingMeta[line.code]?.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(line)
    return acc
  }, {})

  const sortedGroupEntries: [string, any[]][] = Object.entries(grouped)
    .sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    .map(([cat, catLines]) => [
      cat,
      (catLines as any[]).sort((a: any, b: any) =>
        (ingMeta[a.code]?.sort_order ?? 999) - (ingMeta[b.code]?.sort_order ?? 999)
      )
    ])

  const totalToBuy = lines.filter((l: any) => calcUnitsToBuy(l, ingMeta) > 0).length
  const toBuyLines = lines.filter((l: any) => calcUnitsToBuy(l, ingMeta) > 0)
  const doneCount = toBuyLines.filter((l: any) => shopStatus[l.code] === 'full').length
  const partialCount = toBuyLines.filter((l: any) => shopStatus[l.code] === 'partial').length
  const grandTotal = toBuyLines.reduce((sum: number, l: any) => {
    const cost = calcLineCost(l)
    return sum + (cost || 0)
  }, 0)
  const missingPriceCount = toBuyLines.filter((l: any) => getUnitPrice(l.code) == null).length

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
    ok: 'bg-green-50 border-green-200',
    warn: 'bg-amber-50 border-amber-200',
    over: 'bg-red-50 border-red-200',
    missing: 'bg-red-50 border-red-200',
    none: 'bg-gray-50 border-gray-100',
  }[s] || 'bg-gray-50 border-gray-100')

  const statusIcon = (s: string) => {
    if (s === 'ok') return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
    if (s === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
    if (s === 'over') return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
    if (s === 'missing') return <Minus className="w-4 h-4 text-red-400 flex-shrink-0" />
    return null
  }

  const rowBg = (code: string, unitsToBuy: number) => {
    if (unitsToBuy === 0) return ''
    const s = shopStatus[code]
    if (s === 'full') return 'bg-green-50'
    if (s === 'partial') return 'bg-amber-50'
    return 'bg-red-50'
  }

  // Price cell renderer — handles view, edit, and missing
  const renderPriceBlock = (line: any) => {
    const entry = getPriceEntry(line.code)
    const unitPrice = entry?.unit_price ?? null
    const lineCost = calcLineCost(line)
    const isEditing = editingPrice === line.code

    if (isEditing) {
      return (
        <div className="text-xs mt-1 flex items-center gap-1 justify-end">
          <span className="text-gray-400">$</span>
          <input
            ref={priceInputRef}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={priceDraft}
            onChange={e => setPriceDraft(e.target.value)}
            onBlur={() => savePriceFor(line.code, priceDraft)}
            onKeyDown={e => {
              if (e.key === 'Enter') savePriceFor(line.code, priceDraft)
              else if (e.key === 'Escape') { setEditingPrice(null); setPriceDraft('') }
            }}
            placeholder="0.00"
            className="w-20 text-right text-xs border border-brand-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
      )
    }

    if (unitPrice != null) {
      const isManual = entry?.source === 'manual'
      return (
        <button
          onClick={() => { setEditingPrice(line.code); setPriceDraft(String(unitPrice)) }}
          className="text-xs mt-1 text-gray-600 hover:text-brand-700 group flex items-center gap-1 justify-end w-full"
          title={isManual ? 'Manual price — click to edit' : `From receipt${entry?.last_receipt_date ? ' ' + entry.last_receipt_date : ''} — click to override`}
        >
          <span className="text-gray-400">@ {formatMoney(unitPrice)}</span>
          {isManual
            ? <Pencil className="w-3 h-3 text-amber-500" />
            : <Receipt className="w-3 h-3 text-green-500 opacity-70" />
          }
          <span className="text-gray-400">= </span>
          <span className="font-semibold text-gray-800">{formatMoney(lineCost || 0)}</span>
        </button>
      )
    }

    return (
      <button
        onClick={() => { setEditingPrice(line.code); setPriceDraft('') }}
        className="text-xs mt-1 flex items-center gap-1 justify-end text-amber-600 font-medium hover:text-amber-800 w-full"
        title="No receipt or manual price found — click to add"
      >
        <AlertTriangle className="w-3 h-3" />
        Add price
      </button>
    )
  }

  // Buffer cell renderer — inline editable percentage
  const renderBufferBlock = (line: any) => {
    const pct = getBufferPct(line.code, ingMeta[line.code])
    const isEditing = editingBuffer === line.code

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Buffer:</span>
          <input
            ref={bufferInputRef}
            type="number"
            min="0"
            max="1000"
            step="1"
            inputMode="numeric"
            value={bufferDraft}
            onChange={e => setBufferDraft(e.target.value)}
            onBlur={() => saveBufferFor(line.code, bufferDraft)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveBufferFor(line.code, bufferDraft)
              else if (e.key === 'Escape') { setEditingBuffer(null); setBufferDraft('') }
            }}
            placeholder="0"
            className="w-14 text-center text-xs border border-brand-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <span className="text-xs text-gray-400">%</span>
        </div>
      )
    }

    return (
      <button
        onClick={() => { setEditingBuffer(line.code); setBufferDraft(String(pct)) }}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-700"
        title="Click to edit buffer% for this item"
      >
        <span>Buffer:</span>
        <span className={`font-semibold ${pct === 0 ? 'text-orange-500' : 'text-blue-600'}`}>
          {pct}%
        </span>
        <Pencil className="w-3 h-3 opacity-60" />
      </button>
    )
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

            {/* Expected cost summary */}
            {totalToBuy > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Expected total cost</span>
                    <a href="/admin/prices"
                       className="text-xs text-brand-600 hover:text-brand-800 underline ml-2">
                      Manage prices
                    </a>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-brand-700">{formatMoney(grandTotal)}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 justify-end">
                      <span className="flex items-center gap-1">
                        <Receipt className="w-3 h-3 text-green-500" /> from receipts
                      </span>
                      <span className="flex items-center gap-1">
                        <Pencil className="w-3 h-3 text-amber-500" /> manual
                      </span>
                    </div>
                    {missingPriceCount > 0 && (
                      <div className="text-xs text-amber-600 mt-0.5 flex items-center gap-1 justify-end">
                        <AlertTriangle className="w-3 h-3" />
                        {missingPriceCount} item{missingPriceCount > 1 ? 's' : ''} missing price — click any row to add
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
              <span className="font-semibold">Per-item buffer:</span>
              Each item has its own buffer%. Click the Buffer field on any row to change it (0% = exact, 50% = +50% extra).
            </div>

            {sortedGroupEntries.map(([category, catLines]) => {
              const catToOrder = catLines.filter(l => calcUnitsToBuy(l, ingMeta) > 0)
              const catSubtotal = catToOrder.reduce((s: number, l: any) => s + (calcLineCost(l) || 0), 0)
              const catMissing = catToOrder.filter(l => getUnitPrice(l.code) == null).length

              return (
                <Card key={category} className="p-0 overflow-hidden">
                  <div className="px-4 py-2.5 bg-brand-900 text-white font-semibold text-sm flex justify-between items-center">
                    <span>{category}</span>
                    <span className="text-brand-300 text-xs flex items-center gap-3">
                      <span>{catToOrder.length} to order</span>
                      {catToOrder.length > 0 && (
                        <span className="text-white">
                          {formatMoney(catSubtotal)}
                          {catMissing > 0 && (
                            <span className="text-amber-300 ml-1" title={`${catMissing} item(s) missing price`}>*</span>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {catLines.map((line: any) => {
                      const ing = ingMeta[line.code]
                      const needed = Number(line.needed) || 0
                      const conv = Number(line.convFactor) || 1
                      const currentOnHand = (onHand[line.code] || 0) * conv
                      const netNeeded = Math.max(0, needed - currentOnHand)
                      const unitsToBuy = calcUnitsToBuy(line, ingMeta)
                      const bufferPct = getBufferPct(line.code, ing)
                      const status = shopStatus[line.code]
                      const displayName = ing?.name || line.code

                      return (
                        <div key={line.code} className={`px-4 py-3 transition-colors ${rowBg(line.code, unitsToBuy)}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-800 truncate">{displayName}</div>
                              <div className="text-xs text-gray-400">
                                {line.code} · needed: {needed.toFixed(1)} {ing?.recipe_unit || ''}
                              </div>
                            </div>
                            {unitsToBuy > 0 && (
                              <div className="flex-shrink-0 text-right min-w-[180px]">
                                <span className="text-sm font-bold text-white bg-brand-600 px-3 py-1 rounded-full">
                                  Buy {unitsToBuy}
                                </span>
                                {bufferPct > 0 && (
                                  <div className="text-xs text-blue-500 mt-0.5">+{bufferPct}% buffer</div>
                                )}
                                {ing?.vendor_unit_desc && (
                                  <div className="text-xs text-gray-400 mt-0.5">{ing.vendor_unit_desc}</div>
                                )}
                                {renderPriceBlock(line)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
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
                            {renderBufferBlock(line)}
                            {netNeeded > 0 && (
                              <span className="text-xs text-gray-500">need {netNeeded.toFixed(1)} {ing?.recipe_unit} more</span>
                            )}
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
              )
            })}

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
                        const status = getVarianceStatus(recVendorQty, actVendorQty, 1)
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
