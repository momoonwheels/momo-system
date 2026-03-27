'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek } from 'date-fns'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import WeekSelector from '@/components/ui/WeekSelector'
import LocationSelector from '@/components/ui/LocationSelector'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { ShoppingCart } from 'lucide-react'

export default function OrderListPage() {
  const [locationId, setLocationId] = useState('')
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!locationId || !weekStart) return
    setLoading(true)
    const res = await fetch(`/api/order-list?location_id=${locationId}&week_start=${weekStart}`)
    setData(await res.json())
    setLoading(false)
  }, [locationId, weekStart])

  useEffect(() => { load() }, [locationId, weekStart])

  // Group lines by category
  const lines = data?.lines || []
  const ingMeta = (data?.ingredients||[]).reduce((acc: any, ing: any) => { acc[ing.code]=ing; return acc }, {})
  const grouped = lines.reduce((acc: Record<string,any[]>, line: any) => {
    const cat = ingMeta[line.code]?.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(line)
    return acc
  }, {})

  const totalToBuy = lines.filter((l:any)=>l.unitsToBuy>0).length

  return (
    <div className="p-8">
      <PageHeader
        title="Order List"
        sub="Raw ingredients Newport needs to purchase"
        action={
          <div className="flex items-center gap-2 text-sm text-brand-700 bg-brand-50 px-4 py-2 rounded-lg">
            <ShoppingCart className="w-4 h-4" />
            <span className="font-semibold">{totalToBuy}</span> items to order
          </div>
        }
      />
      <div className="flex items-center gap-4 mb-6">
        <LocationSelector onChange={setLocationId} />
        <WeekSelector onChange={setWeekStart} />
      </div>
      {loading ? <LoadingSpinner /> : !data ? (
        <EmptyState icon={ShoppingCart} title="Select a location and week" />
      ) : (
        <div className="space-y-6">
          {(Object.entries(grouped) as [string, any[]][]).map(([category, catLines]) => (
            <Card key={category} className="p-0 overflow-hidden">
              <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm flex items-center justify-between">
                <span>{category}</span>
                <span className="text-brand-300 text-xs">{catLines.filter(l=>l.unitsToBuy>0).length} to order</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Needed</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">On Hand</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Net Needed</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Vendor Unit</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Units to BUY</th>
                  </tr>
                </thead>
                <tbody>
                  {catLines.map((line: any, i: number) => {
                    const ing = ingMeta[line.code]
                    return (
                      <tr key={line.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                        <td className="px-4 py-2.5">
                          <div className="text-sm font-medium text-gray-800">{ing?.name||line.code}</div>
                          <div className="text-xs text-gray-400">{line.code}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm text-gray-600">{line.needed.toFixed(1)} <span className="text-xs text-gray-400">{ing?.recipe_unit}</span></td>
                        <td className="px-4 py-2.5 text-center text-sm text-gray-600">{line.onHand.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-center text-sm text-gray-600">{line.netNeeded.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{ing?.vendor_unit_desc}</td>
                        <td className="px-4 py-2.5 text-center">
                          {line.unitsToBuy > 0 ? (
                            <span className="text-sm font-bold text-white bg-brand-600 px-3 py-1 rounded-full">
                              {line.unitsToBuy}
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