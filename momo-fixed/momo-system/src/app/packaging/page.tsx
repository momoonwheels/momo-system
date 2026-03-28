'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek } from 'date-fns'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import WeekSelector from '@/components/ui/WeekSelector'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { Package, Settings, X, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const ALL_DAYS = ['mon','tue','wed','thu','fri','sat','sun']
const DAY_LABELS: Record<string,string> = {
  mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun'
}

export default function PackagingPage() {
  const [locationId, setLocationId] = useState('')
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [data, setData] = useState<any>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [schedule, setSchedule] = useState<{id?:string; pack_slot:number; label:string; days:string[]}[]>([
    { pack_slot:1, label:'Pack 1', days:[] },
    { pack_slot:2, label:'Pack 2', days:[] },
  ])
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => {
    supabase.from('locations').select('*').eq('type','food_truck').eq('active',true)
      .then(({data: locs}) => {
        setLocations(locs||[])
        if (locs?.[0]) setLocationId(locs[0].id)
      })
  }, [])

  useEffect(() => {
    if (!locationId) return
    fetch(`/api/delivery-schedule?location_id=${locationId}`)
      .then(r => r.json()).then(data => {
        if (data?.length > 0) setSchedule(data.map((s: any) => ({ id:s.id, pack_slot:s.pack_slot, label:s.label, days:s.days||[] })))
      })
  }, [locationId])

  const load = useCallback(async () => {
    if (!locationId || !weekStart) return
    setLoading(true)
    const res = await fetch(`/api/packaging?location_id=${locationId}&week_start=${weekStart}`)
    setData(await res.json())
    setLoading(false)
  }, [locationId, weekStart])

  useEffect(() => { load() }, [locationId, weekStart])

  const saveSchedule = async () => {
    setSavingSchedule(true)
    await fetch('/api/delivery-schedule', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(schedule.map(s => ({ ...s, location_id: locationId })))
    })
    setSavingSchedule(false)
    setShowSchedule(false)
    load()
  }

  const toggleDay = (slotIdx: number, day: string) => {
    setSchedule(prev => prev.map((s, i) => {
      if (i !== slotIdx) return s
      const days = s.days.includes(day) ? s.days.filter(d => d !== day) : [...s.days, day]
      return { ...s, days }
    }))
  }

  const computeNeeds = (orders: any, apiData: any) => {
    const totalOrders = apiData.orders
    const result: Record<string,number> = {}
    for (const code in apiData.needed) {
      const totalNeeded = apiData.needed[code] || 0
      const totalAll = (totalOrders.REG||0)+(totalOrders.FRI||0)+(totalOrders.CHI||0)+(totalOrders.JHO||0)+(totalOrders.CW||0)
      const thisAll = (orders.REG||0)+(orders.FRI||0)+(orders.CHI||0)+(orders.JHO||0)+(orders.CW||0)
      result[code] = totalAll > 0 ? Math.ceil(totalNeeded * thisAll / totalAll) : 0
    }
    return result
  }

  const calcForDays = (days: string[]) => {
    if (!data?.weekOrders) return {}
    const orders = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
    for (const code of Object.keys(data.weekOrders))
      for (const day of days) orders[code as keyof typeof orders] += data.weekOrders[code]?.[day]||0
    return computeNeeds(orders, data)
  }

  const grouped = data?.packages?.reduce((acc: Record<string,any[]>, pkg: any) => {
    const cont = pkg.containers?.name || 'Other'
    if (!acc[cont]) acc[cont] = []
    acc[cont].push(pkg)
    return acc
  }, {}) || {}

  const slotNeeds = schedule.map((s, i) => {
    const needs = calcForDays(s.days)
    const toSend: Record<string,number> = {}
    for (const code in needs) {
      const onTruck = i === 0 ? (data?.totalOnTruck?.[code]||0) : 0
      toSend[code] = Math.max(0, (needs[code]||0) - onTruck)
    }
    return { needs, toSend }
  })

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Packaging"
        sub="What Newport needs to send"
        action={
          <button onClick={() => setShowSchedule(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium">
            <Settings className="w-4 h-4" /> Schedule
          </button>
        }
      />

      {showSchedule && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end lg:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between p-4 lg:p-6 border-b">
              <h2 className="font-bold text-lg">Edit Delivery Schedule</h2>
              <button onClick={() => setShowSchedule(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 lg:p-6 space-y-6">
              {schedule.map((slot, i) => (
                <div key={i}>
                  <div className="flex items-center gap-3 mb-3">
                    <input type="text" value={slot.label}
                      onChange={e => setSchedule(prev => prev.map((s, idx) => idx===i?{...s,label:e.target.value}:s))}
                      className="text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 w-36" />
                    <span className="text-xs text-gray-400">covers:</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {ALL_DAYS.map(day => (
                      <button key={day} onClick={() => toggleDay(i, day)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium min-w-12 ${
                          slot.days.includes(day) ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>{DAY_LABELS[day]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 p-4 lg:p-6 border-t">
              <button onClick={() => setShowSchedule(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">Cancel</button>
              <button onClick={saveSchedule} disabled={savingSchedule}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                <Check className="w-4 h-4" />
                {savingSchedule ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">📍</span>
          <select value={locationId} onChange={e => setLocationId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <WeekSelector onChange={setWeekStart} />
      </div>

      {loading ? <LoadingSpinner /> : !data ? (
        <EmptyState icon={Package} title="Select a location and week" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {schedule.map((s, i) => {
              const totalPkgs = Object.values(slotNeeds[i]?.toSend||{}).filter((v:any)=>v>0).length
              return (
                <div key={i} className="bg-brand-50 rounded-xl p-3 border border-brand-100">
                  <div className="font-semibold text-brand-800 text-sm">{s.label}</div>
                  <div className="text-xs text-brand-500">{s.days.map(d=>DAY_LABELS[d]).join('+') || 'No days'}</div>
                  <div className="text-2xl font-bold text-brand-700 mt-1">{totalPkgs}</div>
                  <div className="text-xs text-brand-500">types to send</div>
                </div>
              )
            })}
          </div>

          {(Object.entries(grouped) as [string, any[]][]).map(([container, pkgs]) => (
            <Card key={container} className="p-0 overflow-hidden">
              <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm">{container}</div>
              <div className="table-scroll">
                <table className="w-full min-w-max">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                      <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 min-w-20">Pkg</th>
                      <th className="text-left px-3 py-2 min-w-32">Contents</th>
                      <th className="text-center px-3 py-2 text-green-600 min-w-16">On Truck</th>
                      {schedule.map((s, i) => (
                        <th key={i} className="text-center px-3 py-2 text-brand-700 min-w-20">{s.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pkgs.map((pkg: any, i: number) => {
                      const total = data.totalOnTruck?.[pkg.code]||0
                      return (
                        <tr key={pkg.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                          <td className="px-3 py-2.5 text-xs font-mono font-bold text-brand-700 sticky left-0 bg-inherit">{pkg.code}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-700">{pkg.contents}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">{total}</span>
                          </td>
                          {schedule.map((s, si) => {
                            const send = slotNeeds[si]?.toSend?.[pkg.code]||0
                            return (
                              <td key={si} className="px-3 py-2.5 text-center">
                                <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${send>0?'text-white bg-brand-600':'text-gray-400 bg-gray-100'}`}>{send}</span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}