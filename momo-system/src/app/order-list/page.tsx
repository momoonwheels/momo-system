'use client'
import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ShoppingCart, Save, RotateCcw } from 'lucide-react'

function snapToWednesday(): string {
  const d = new Date()
  const day = d.getDay() // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  const diff = day >= 3 ? day - 3 : day + 4
  d.setDate(d.getDate() - diff)
  return format(d, 'yyyy-MM-dd')
}

export default function OrderListPage() {
  const [weekStart, setWeekStart] = useState<string>(snapToWednesday)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [onHand, setOnHand] = useState<Record<string,number>>({})
  const [saving, setSaving] = useState(false)

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
        } else {
          oh[ing.code] = 0
        }
      }
      setOnHand(oh)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

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
      const { error } = await supabase
        .from('newport_inventory')
        .update({ quantity_on_hand: val })
        .eq('ingredient_id', ing.id)
      if (error) { console.error('Save error:', ing.code, error); failed = true }
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
    } catch (e) { console.error('Truck reset error:', e) }
    toast.success('All on-hand reset to 0 — click Save to confirm Newport')
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
    acc[ing.code] = ing
    return acc
  }, {})

  const grouped = lines.reduce((acc: Record<string,any[]>, line: any) => {
    const cat = ingMeta[line.code]?.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(line)
    return acc
  }, {})

  const totalToBuy = lines.filter((l: any) => calcUnitsToBuy(l) > 0).length

  // Week label: LC = Wed-Sun, Salem = Thu-Wed
  const wedDate = new Date(weekStart + 'T12:00:00')
  const wedNextDate = new Date(wedDate); wedNextDate.setDate(wedDate.getDate() + 7)
const weekLabel = `${format(wedDate, 'MMM d')} – ${format(wedNextDate, 'MMM d, yyyy')}`
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
            <button
              onClick={resetAll}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All to 0
            </button>
            <button
              onClick={saveOnHand}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        }
      />

      {/* Week nav */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
          Newport (LC + Salem)
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="date"
            value={weekStart}
            onChange={e => {
              const d = new Date(e.target.value + 'T12:00:00')
              const day = d.getDay()
              const diff = day >= 3 ? day - 3 : day + 4
              d.setDate(d.getDate() - diff)
              setWeekStart(format(d, 'yyyy-MM-dd'))
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500"
          />
          <button onClick={() => shiftWeek(1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
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

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : !data ? null : (
        <div className="space-y-4">
          {(Object.entries(grouped) as [string,any[]][]).map(([category, catLines]) => (
            <Card key={category} className="p-0 overflow-hidden">
              <div className="px-4 py-2.5 bg-brand-900 text-white font-semibold text-sm flex justify-between">
                <span>{category}</span>
                <span className="text-brand-300 text-xs">
                  {catLines.filter(l => calcUnitsToBuy(l) > 0).length} to order
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {catLines.map((line: any) => {
                  const ing = ingMeta[line.code]
                  const needed = Number(line.needed) || 0
                  const conv = Number(line.convFactor) || 1
                  const currentOnHand = (onHand[line.code] || 0) * conv
                  const netNeeded = Math.max(0, needed - currentOnHand)
                  const unitsToBuy = calcUnitsToBuy(line)
                  return (
                    <div key={line.code} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-800 truncate">
                            {ing?.name || line.code}
                          </div>
                          <div className="text-xs text-gray-400">
                            {line.code} · needed: {needed.toFixed(1)} {ing?.recipe_unit}
                          </div>
                        </div>
                        {unitsToBuy > 0 && (
                          <span className="text-sm font-bold text-white bg-brand-600 px-3 py-1 rounded-full flex-shrink-0">
                            Buy {unitsToBuy}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs text-gray-500">On Hand:</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={onHand[line.code] ?? 0}
                            onChange={e => setOnHand(prev => ({
                              ...prev,
                              [line.code]: Number(e.target.value)
                            }))}
                            className="w-20 text-center text-sm border border-green-200 bg-green-50 text-green-800 font-semibold rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                          <span className="text-xs text-gray-400">   {ing?.vendor_unit_desc ? ing.vendor_unit_desc.split('=')[0].trim() : ing?.recipe_unit} </span>
                          {ing?.vendor_unit_desc && (
  <span className="text-xs text-gray-300 ml-1">({ing.vendor_unit_desc})</span>
)}
                        </div>
                        {netNeeded > 0 && (
                          <span className="text-xs text-gray-500">need {netNeeded.toFixed(1)} more</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
