'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek } from 'date-fns'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import WeekSelector from '@/components/ui/WeekSelector'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function PackagingPage() {
  const [locationId, setLocationId] = useState('')
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [data, setData] = useState<any>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('locations').select('*').eq('type','food_truck').eq('active',true)
      .then(({data: locs}) => {
        setLocations(locs||[])
        if (locs?.[0]) setLocationId(locs[0].id)
      })
  }, [])

  const load = useCallback(async () => {
    if (!locationId || !weekStart) return
    setLoading(true)
    const res = await fetch(`/api/packaging?location_id=${locationId}&week_start=${weekStart}`)
    setData(await res.json())
    setLoading(false)
  }, [locationId, weekStart])

  useEffect(() => { load() }, [locationId, weekStart])

  const schedule: {label:string;days:string[]}[] = data?.schedule || []
  const dayGroupToSend = data?.dayGroupToSend || {}
  const dayGroupNeeds = data?.dayGroupNeeds || {}

  const grouped = data?.packages?.reduce((acc: Record<string,any[]>, pkg: any) => {
    const cont = pkg.containers?.name || 'Other'
    if (!acc[cont]) acc[cont] = []
    acc[cont].push(pkg)
    return acc
  }, {}) || {}

  return (
    <div className="p-8">
      <PageHeader title="Packaging List" sub="Newport packing list — by delivery day" />
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">📍</span>
          <select
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500">
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <WeekSelector onChange={setWeekStart} />
      </div>

      {loading ? <LoadingSpinner /> : !data ? (
        <EmptyState icon={Package} title="Select a location and week" />
      ) : (
        <div className="space-y-6">
          {/* Summary strip */}
          {schedule.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {schedule.map(s => {
                const totalPkgs = Object.values(dayGroupToSend[s.label]||{}).filter((v:any)=>v>0).length
                return (
                  <div key={s.label} className="bg-brand-50 rounded-xl p-4 border border-brand-100">
                    <div className="font-semibold text-brand-800 text-sm">{s.label}</div>
                    <div className="text-2xl font-bold text-brand-700 mt-1">{totalPkgs}</div>
                    <div className="text-xs text-brand-500">package types to send</div>
                  </div>
                )
              })}
            </div>
          )}

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
                    <th className="text-center px-4 py-2 text-xs font-medium text-green-600 uppercase">
                      On Truck<br/>
                      <span className="text-gray-400 normal-case font-normal">Hand + Delivery</span>
                    </th>
                    {schedule.length > 0 ? schedule.map(s => (
                      <th key={s.label} className="text-center px-4 py-2 text-xs font-medium text-brand-700 uppercase bg-brand-50">
                        {s.label}
                      </th>
                    )) : (
                      <th className="text-center px-4 py-2 text-xs font-medium text-brand-700 uppercase">To Send</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pkgs.map((pkg: any, i: number) => {
                    const total = data.totalOnTruck?.[pkg.code] || 0
                    const onHand = data.onTruck?.[pkg.code] || 0
                    const delRec = data.onTruckDelivery?.[pkg.code] || 0
                    return (
                      <tr key={pkg.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                        <td className="px-4 py-2.5 text-sm font-mono font-bold text-brand-700">{pkg.code}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{pkg.contents}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 text-center">{pkg.size_qty} {pkg.size_unit}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                            {total}
                            {(onHand > 0 || delRec > 0) && (
                              <span className="text-xs text-green-500 ml-1">({onHand}+{delRec})</span>
                            )}
                          </span>
                        </td>
                        {schedule.length > 0 ? schedule.map(s => {
                          const send = dayGroupToSend[s.label]?.[pkg.code] || 0
                          const needed = dayGroupNeeds[s.label]?.[pkg.code] || 0
                          return (
                            <td key={s.label} className="px-4 py-2.5 text-center bg-brand-50/30">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                                  send > 0 ? 'text-white bg-brand-600' : 'text-gray-400 bg-gray-100'
                                }`}>{send}</span>
                                {needed > 0 && <span className="text-xs text-gray-400">of {needed} needed</span>}
                              </div>
                            </td>
                          )
                        }) : (
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                              (data.toSend?.[pkg.code]||0) > 0 ? 'text-white bg-brand-600' : 'text-gray-400 bg-gray-100'
                            }`}>{data.toSend?.[pkg.code]||0}</span>
                          </td>
                        )}
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
