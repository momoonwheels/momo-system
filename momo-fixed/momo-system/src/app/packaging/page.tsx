'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek } from 'date-fns'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import WeekSelector from '@/components/ui/WeekSelector'
import LocationSelector from '@/components/ui/LocationSelector'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { Package } from 'lucide-react'

export default function PackagingPage() {
  const [locationId, setLocationId] = useState('')
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!locationId || !weekStart) return
    setLoading(true)
    const res = await fetch(`/api/packaging?location_id=${locationId}&week_start=${weekStart}`)
    setData(await res.json())
    setLoading(false)
  }, [locationId, weekStart])

  useEffect(() => { load() }, [locationId, weekStart])

  const grouped = data?.packages?.reduce((acc: Record<string,any[]>, pkg: any) => {
    const cont = pkg.containers?.name || 'Other'
    if (!acc[cont]) acc[cont] = []
    acc[cont].push(pkg)
    return acc
  }, {}) || {}

  return (
    <div className="p-8">
      <PageHeader title="Packaging List" sub="What Newport needs to prepare and send to the truck" />
      <div className="flex items-center gap-4 mb-6">
        <LocationSelector onChange={setLocationId} filter="food_truck" />
        <WeekSelector onChange={setWeekStart} />
      </div>
      {loading ? <LoadingSpinner /> : !data ? (
        <EmptyState icon={Package} title="Select a location and week" sub="Packaging list will appear here" />
      ) : (
        <div className="space-y-6">
          {(Object.entries(grouped) as [string, any[]][]).map(([container, pkgs]) => (
            <Card key={container} className="p-0 overflow-hidden">
              <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm">
                {container} Container
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Package</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Contents</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Size</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Total Needed</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">On Truck</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">To Send</th>
                  </tr>
                </thead>
                <tbody>
                  {pkgs.map((pkg: any, i: number) => {
                    const needed = data.needed?.[pkg.code] || 0
                    const onTruck = data.onTruck?.[pkg.code] || 0
                    const toSend = data.toSend?.[pkg.code] || 0
                    return (
                      <tr key={pkg.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                        <td className="px-4 py-2.5 text-sm font-mono font-bold text-brand-700">{pkg.code}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{pkg.contents}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 text-center">{pkg.size_qty} {pkg.size_unit}</td>
                        <td className="px-4 py-2.5 text-center text-sm text-gray-600">{needed}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">{onTruck}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                            toSend > 0 ? 'text-white bg-brand-600' : 'text-gray-400 bg-gray-100'
                          }`}>{toSend}</span>
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