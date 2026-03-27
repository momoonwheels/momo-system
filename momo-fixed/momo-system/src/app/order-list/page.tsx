'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import WeekSelector from '@/components/ui/WeekSelector'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { ShoppingCart, Save } from 'lucide-react'

export default function OrderListPage() {
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [onHand, setOnHand] = useState<Record<string,number>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!weekStart) return
    setLoading(true)
    const res = await fetch(`/api/order-list?combined=true&week_start=${weekStart}`)
    const json = await res.json()
    setData(json)
    // Initialize on-hand from existing inventory
    const oh: Record<string,number> = {}
    for (const line of json?.lines || []) {
      oh[line.code] = Number(line.onHand) || 0
    }
    setOnHand(oh)
    setLoading(false)
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const saveOnHand = async () => {
    setSaving(true)
    const { supabase } = await import('@/lib/supabase')
    const ingData = data?.ingredients || []
    const updates = ingData
      .filter((ing: any) => onHand[ing.code] !== undefined)
      .map((ing: any) => ({
        ingredient_id: ing.id,
        quantity_on_hand: onHand[ing.code] || 0
      }))
    const { error } = await supabase
      .from('newport_inventory')
      .upsert(updates, { onConflict: 'ingredient_id' })
    if (error) { toast.error('Failed to save'); setSaving(false); return }
    toast.success('Inventory saved!')
    setSaving(false)
    load() // Refresh to recalculate units to buy
  }

  // Recalculate units to buy based on current on-hand inputs
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
  const ingMeta = (data?.ingredients||[]).reduce((acc: any, ing: any) => {
    acc[ing.code] = ing; return acc
  }, {})

  const grouped = lines.reduce((acc: Record<string,any[]>, line: any) => {
    const cat = ingMeta[line.code]?.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(line)
    return acc
  }, {})

  const totalToBuy = lines.filter((l:any) => calcUnitsToBuy(l) > 0).length

  return (
    <div className="p-8">
      <PageHeader
        title="Order List"
        sub="Newport — combined orders from all food trucks"
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-brand-700 bg-brand-50 px-4 py-2 rounded-lg">
              <ShoppingCart className="w-4 h-4" />
              <span className="font-semibold">{totalToBuy}</span> items to order
            </div>
            <button onClick={saveOnHand} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save On Hand'}
            </button>
          </div>
        }
      />
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
          📍 Newport (Combined — LC + Salem)
        </div>
        <WeekSelector onChange={setWeekStart} />
      </div>
      {loading ? <LoadingSpinner /> : !data ? (
        <EmptyState icon={ShoppingCart} title="No data" />
      ) : (
        <div className="space-y-6">
          {(Object.entries(grouped) as [string, any[]][]).map(([category, catLines]) => (
            <Card key={category} className="p-0 overflow-hidden">
              <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm flex items-center justify-between">
                <span>{category}</span>
                <span className="text-brand-300 text-xs">
                  {catLines.filter(l => calcUnitsToBuy(l) > 0).length} to order
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Needed</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">On Hand (vendor units) ← enter here</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Net Needed</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Vendor Unit</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Units to BUY</th>
                  </tr>
                </thead>
                <tbody>
                  {catLines.map((line: any, i: number) => {
                    const ing = ingMeta[line.code]
                    const needed = Number(line.needed) || 0
                    const conv = Number(line.convFactor) || 1
                    const currentOnHand = (onHand[line.code] || 0) * conv
                    const netNeeded = Math.max(0, needed - currentOnHand)
                    const unitsToBuy = calcUnitsToBuy(line)
                    return (
                      <tr key={line.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                        <td className="px-4 py-2.5">
                          <div className="text-sm font-medium text-gray-800">{ing?.name||line.code}</div>
                          <div className="text-xs text-gray-400">{line.code} · {ing?.recipe_unit}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm text-gray-600">
                          {needed.toFixed(1)} <span className="text-xs text-gray-400">{ing?.recipe_unit}</span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number" min="0" step="any"
                            value={onHand[line.code] ?? 0}
                            onChange={e => setOnHand(prev => ({
                              ...prev, [line.code]: Number(e.target.value) || 0
                            }))}
                            className="w-24 text-center text-sm border border-green-200 bg-green-50 text-green-800 font-semibold rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm text-gray-600">
                          {netNeeded.toFixed(1)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{ing?.vendor_unit_desc}</td>
                        <td className="px-4 py-2.5 text-center">
                          {unitsToBuy > 0 ? (
                            <span className="text-sm font-bold text-white bg-brand-600 px-3 py-1 rounded-full">
                              {unitsToBuy}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
