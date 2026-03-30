'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { Settings, X, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

function snapToWeekStart(date: Date, weekStartDay: string): Date {
  const dayNum: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
    friday: 5, saturday: 6, sunday: 0,
  }
  const target = dayNum[weekStartDay] ?? 1
  const d = new Date(date)
  const current = d.getDay()
  let diff = current - target
  if (diff < 0) diff += 7
  d.setDate(d.getDate() - diff)
  return d
}

const ALL_DAYS = ['mon','tue','wed','thu','fri','sat','sun'] as const
const DAY_LABELS: Record<string, string> = {
  mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun'
}

export default function PackagingPage() {
  const [locations, setLocations]       = useState<any[]>([])
  const [locationId, setLocationId]     = useState('')
  const [weekStart, setWeekStart]       = useState('')
  const [data, setData]                 = useState<any>(null)
  const [loading, setLoading]           = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [schedule, setSchedule]         = useState<{ label: string; days: string[] }[]>([])
  const [savingSchedule, setSavingSchedule] = useState(false)

  const location = locations.find(l => l.id === locationId)
  const weekStartDay = location?.week_start_day ?? 'monday'

  useEffect(() => {
    supabase.from('locations')
      .select('id,name,week_start_day,operating_days')
      .not('name', 'ilike', '%newport%')
      .order('name')
      .then(({ data: locs }) => {
        const list = locs ?? []
        setLocations(list)
        if (list[0]) {
          setLocationId(list[0].id)
          const snapped = snapToWeekStart(new Date(), list[0].week_start_day ?? 'monday')
          setWeekStart(format(snapped, 'yyyy-MM-dd'))
        }
      })
  }, [])

  const handleLocationChange = (id: string) => {
    setLocationId(id)
    const loc = locations.find(l => l.id === id)
    if (loc) {
      const snapped = snapToWeekStart(new Date(), loc.week_start_day ?? 'monday')
      setWeekStart(format(snapped, 'yyyy-MM-dd'))
    }
  }

  const handleDatePick = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    const snapped = snapToWeekStart(d, weekStartDay)
    setWeekStart(format(snapped, 'yyyy-MM-dd'))
  }

  const load = useCallback(async () => {
    if (!locationId || !weekStart) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/packaging?location_id=${locationId}&week_start=${weekStart}`,
        { cache: 'no-store' }
      )
      const json = await res.json()
      setData(json)

      const { data: schedData } = await supabase
        .from('delivery_schedule')
        .select('*')
        .eq('location_id', locationId)
        .order('pack_slot')

      if (schedData?.length) {
        setSchedule(schedData.map((s: any) => ({ label: s.label, days: s.days })))
      } else {
        setSchedule([{ label: 'All Packages', days: [] }])
      }
    } finally {
      setLoading(false)
    }
  }, [locationId, weekStart])

  useEffect(() => { load() }, [load])

  const saveSchedule = async () => {
    setSavingSchedule(true)
    try {
      await supabase.from('delivery_schedule').delete().eq('location_id', locationId)
      const rows = schedule.map((s, i) => ({
        location_id: locationId,
        pack_slot: i + 1,
        label: s.label,
        days: s.days,
      }))
      await supabase.from('delivery_schedule').insert(rows)
      toast.success('Schedule saved!')
      setShowSchedule(false)
      load()
    } catch { toast.error('Save failed') }
    finally { setSavingSchedule(false) }
  }

  const toggleDay = (slotIdx: number, day: string) => {
    setSchedule(prev => prev.map((s, i) => {
      if (i !== slotIdx) return s
      const days = s.days.includes(day) ? s.days.filter(d => d !== day) : [...s.days, day]
      return { ...s, days }
    }))
  }

  // Calculate packages for a set of days using weekOrders
  const calcSlotNeeds = (days: string[], slotIdx: number) => {
    if (!data) return {}
    // If no days configured OR only one slot, use full needed/toSend
    if (!days.length || schedule.length <= 1) {
      return slotIdx === 0 ? (data.toSend ?? {}) : (data.needed ?? {})
    }
    // Calculate per-day orders for this slot
    const weekOrders = data.weekOrders ?? {}
    const slotOrders: Record<string, number> = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
    for (const menuCode of Object.keys(slotOrders)) {
      slotOrders[menuCode] = days.reduce((sum, day) => sum + (weekOrders[menuCode]?.[day] || 0), 0)
    }
    // Use cfg to calculate package needs for these orders
    const cfg = data.cfg ?? {}
    const buf = 1 + (cfg.BUF_PCT ?? 0.05)
    const needed: Record<string, number> = {}
    const { REG, FRI, CHI, JHO, CW } = slotOrders

    const batchRA = Math.ceil((REG+FRI+JHO) / (cfg.BATCH_RA ?? 40))
    const batchSA = Math.ceil((REG+FRI) / (cfg.BATCH_SA ?? 40))
    const batchJH = Math.ceil(JHO / (cfg.BATCH_JH ?? 10))
    const batchCW = Math.ceil(CW / (cfg.BATCH_CW ?? 10))

    needed['FM-1']  = Math.ceil((REG+FRI+CHI+JHO)*(cfg.SERV_MM_PCS??10)/(cfg.SZ_FM1??100))
    needed['CM-1']  = Math.ceil(CHI*buf*8/(cfg.SZ_CM1??84.5))
    needed['CM-2']  = Math.ceil(CHI*4/(cfg.SZ_CM2??80))
    needed['JM-1']  = batchJH
    needed['JM-3']  = Math.ceil(JHO*(cfg.SERV_JM3_10??4)/10/(cfg.SZ_JM3??16))
    needed['JM-4']  = Math.ceil(JHO*(cfg.SERV_JM4_15??0.5)/15/(cfg.SZ_JM4??2))
    needed['JM-5']  = Math.ceil(JHO*0.25*0.17/(cfg.SZ_JM5??0.5))
    needed['CH-1']  = Math.ceil(CW*2.5/(cfg.SZ_CH1??80))
    needed['CH-3']  = Math.ceil(CW*buf/(cfg.SZ_CH3??33.8))
    needed['CH-4']  = Math.ceil(CW*0.17/(cfg.SZ_CH4??0.5))
    needed['CH-5']  = Math.ceil(CW/(cfg.SZ_CH5??10))
    needed['CH-6']  = Math.ceil(CW*2/(cfg.SZ_CH6??80))
    needed['CH-7']  = Math.ceil(CW*6/(cfg.SZ_CH7??64))

    // Subtract on-truck for first slot only
    if (slotIdx === 0) {
      const totalOnTruck = data.totalOnTruck ?? {}
      for (const k in needed) {
        needed[k] = Math.max(0, needed[k] - (totalOnTruck[k] ?? 0))
      }
    }
    return needed
  }

  const weekStartDate = weekStart ? parseISO(weekStart) : new Date()
  const weekEndDate   = addDays(weekStartDate, (location?.operating_days?.length ?? 7) - 1)
  const weekLabel     = weekStart
    ? `Week of ${format(weekStartDate, 'MMM d')} – ${format(weekEndDate, 'MMM d, yyyy')}`
    : '—'

  // Group packages by container
  const grouped = (data?.packages ?? []).reduce((acc: Record<string, any[]>, pkg: any) => {
    const cont = pkg.containers?.code ?? 'Other'
    if (!acc[cont]) acc[cont] = []
    acc[cont].push(pkg)
    return acc
  }, {})

  const containerOrder = ['FM','CM','JM','CH','RA','SA','ST','WAT','Other']
  const sortedGroups = containerOrder
    .filter(c => grouped[c]?.length > 0)
    .map(c => [c, grouped[c]] as [string, any[]])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packaging List"
        sub="Newport packing list — by delivery slot"
        action={
          <button onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Settings className="w-4 h-4" /> Edit Schedule
          </button>
        }
      />

      {/* Controls */}
      <Card>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Location</label>
            <select value={locationId} onChange={e => handleLocationChange(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500">
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Week of</label>
            <input type="date" value={weekStart} onChange={e => handleDatePick(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="text-sm font-medium text-gray-700 bg-green-50 px-3 py-1.5 rounded-lg">
            {weekLabel}
            {location && <span className="ml-2 text-xs text-gray-400">(starts {weekStartDay.slice(0,3)})</span>}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : !data ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-8 h-8 mx-auto mb-2" />
          <p>No data. Select a location and week.</p>
        </div>
      ) : (
        <>
          {/* Delivery slot columns */}
          <div className={`grid gap-4 ${schedule.length >= 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {schedule.map((slot, slotIdx) => {
              const slotNeeds = calcSlotNeeds(slot.days, slotIdx)
              const hasAny = Object.values(slotNeeds).some((v: any) => v > 0)
              return (
                <Card key={slot.label}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900">{slot.label}</h3>
                      <p className="text-xs text-gray-400">
                        {slot.days.length > 0
                          ? slot.days.map(d => DAY_LABELS[d]).join(', ')
                          : 'All days combined'}
                      </p>
                    </div>
                    {slotIdx === 0 && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        Subtracts on-truck
                      </span>
                    )}
                  </div>

                  {!hasAny ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nothing to send</p>
                  ) : (
                    <div className="space-y-3">
                      {sortedGroups.map(([contCode, pkgs]) => {
                        const visiblePkgs = pkgs.filter((pkg: any) => (slotNeeds[pkg.code] ?? 0) > 0)
                        if (!visiblePkgs.length) return null
                        return (
                          <div key={contCode}>
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider pb-1 border-b border-gray-100">
                              {contCode} — {pkgs[0]?.containers?.name ?? contCode}
                            </div>
                            {visiblePkgs.map((pkg: any) => {
                              const send = slotNeeds[pkg.code] ?? 0
                              return (
                                <div key={pkg.code}
                                  className="flex items-center justify-between py-1.5 px-1 hover:bg-gray-50 rounded">
                                  <div>
                                    <span className="text-sm font-medium text-gray-800">{pkg.name}</span>
                                    <span className="ml-2 text-xs text-gray-400">{pkg.code}</span>
                                    {pkg.contents && (
                                      <div className="text-xs text-gray-400">{pkg.contents} · {pkg.size_qty} {pkg.size_unit}</div>
                                    )}
                                  </div>
                                  <span className={`text-sm font-bold ml-4 flex-shrink-0 ${send > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                                    × {send}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {/* On-truck summary */}
          {data.totalOnTruck && Object.values(data.totalOnTruck as Record<string,number>).some(v => v > 0) && (
            <Card>
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Currently on truck</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.totalOnTruck as Record<string,number>)
                  .filter(([,qty]) => qty > 0)
                  .map(([code, qty]) => (
                    <span key={code}
                      className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                      {code}: {qty}
                    </span>
                  ))}
              </div>
            </Card>
          )}

          {/* Orders summary */}
          <Card>
            <h3 className="font-semibold text-gray-700 text-sm mb-3">This week's orders (basis for calculation)</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.orders as Record<string,number>).map(([code, qty]) => (
                <div key={code} className="text-center bg-gray-50 rounded-lg px-4 py-2">
                  <div className="text-xs text-gray-400">{code}</div>
                  <div className="text-lg font-bold text-gray-800">{qty}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Edit Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-bold text-lg text-gray-900">Edit Delivery Schedule</h2>
              <button onClick={() => setShowSchedule(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {schedule.map((slot, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input type="text" value={slot.label}
                      onChange={e => setSchedule(prev => prev.map((s, idx) =>
                        idx === i ? { ...s, label: e.target.value } : s
                      ))}
                      className="text-sm font-semibold border border-gray-200 rounded-lg px-3 py-1.5 w-32"
                    />
                    <span className="text-xs text-gray-400">covers which days?</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {ALL_DAYS.map(day => (
                      <button key={day} onClick={() => toggleDay(i, day)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          slot.days.includes(day) ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {DAY_LABELS[day]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    {slot.days.length > 0
                      ? `Covers: ${slot.days.map(d => DAY_LABELS[d]).join(', ')}`
                      : 'No days selected — shows full week total'}
                  </p>
                </div>
              ))}
              <button onClick={() => setSchedule(prev => [...prev, { label: `Pack ${prev.length + 1}`, days: [] }])}
                className="text-sm text-green-700 hover:text-green-800 font-medium">
                + Add another delivery slot
              </button>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button onClick={() => setShowSchedule(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={saveSchedule} disabled={savingSchedule}
                className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
                {savingSchedule ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
