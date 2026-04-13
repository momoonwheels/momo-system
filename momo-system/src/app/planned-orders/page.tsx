'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ChevronLeft, ChevronRight, Save, RefreshCw, Sun, Moon, Sparkles, X, Lock, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Location {
  id: string
  name: string
  week_start_day: string
  operating_days: string[]
  is_summer_schedule: boolean
}

interface MenuItem {
  id: string
  name: string
  code: string
  sort_order: number
}

interface OrderRow {
  id?: string
  location_id: string
  menu_item_id: string
  week_start: string
  mon: number; tue: number; wed: number; thu: number
  fri: number; sat: number; sun: number
}

const ALL_DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

function getOrderedDays(weekStartDay: string): DayKey[] {
  const order: DayKey[] = ['mon','tue','wed','thu','fri','sat','sun']
  const startIdx = {
    monday:0, tuesday:1, wednesday:2, thursday:3,
    friday:4, saturday:5, sunday:6,
  }[weekStartDay] ?? 0
  return [...order.slice(startIdx), ...order.slice(0, startIdx)]
}

function snapToWeekStart(date: Date, weekStartDay: string): Date {
  const dayNum = {
    monday:1, tuesday:2, wednesday:3, thursday:4,
    friday:5, saturday:6, sunday:0,
  }[weekStartDay] ?? 1
  const d = new Date(date)
  let diff = d.getDay() - dayNum
  if (diff < 0) diff += 7
  d.setDate(d.getDate() - diff)
  return d
}

function getDayDate(weekStartDate: Date, weekStartDay: string, dayKey: DayKey): Date {
  const orderedDays = getOrderedDays(weekStartDay)
  const idx = orderedDays.indexOf(dayKey)
  return addDays(weekStartDate, idx)
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PlannedOrdersPage() {
  const [locations,   setLocations]   = useState<Location[]>([])
  const [menuItems,   setMenuItems]   = useState<MenuItem[]>([])
  const [locationId,  setLocationId]  = useState<string>('')
  const [weekStart,   setWeekStart]   = useState<string>('')
  const [orders,      setOrders]      = useState<Record<string, OrderRow>>({})
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [forecasting,   setForecasting]   = useState(false)
  const [aiNote,        setAiNote]        = useState<string>('')
  const [showNote,      setShowNote]      = useState(false)
  const [accuracy,      setAccuracy]      = useState<any[]>([])
  const [closingWeek,   setClosingWeek]   = useState(false)
  const [squareLocMap,  setSquareLocMap]  = useState<Record<string,string>>({})

  const location      = locations.find(l => l.id === locationId)
  const operatingDays = location?.operating_days ?? ALL_DAYS.map(d => d.key)
  const weekStartDay  = location?.week_start_day ?? 'monday'
  const orderedDays   = getOrderedDays(weekStartDay)
  const visibleDays   = orderedDays.filter(d => operatingDays.includes(d))

  // ─── Load reference data ──────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const [{ data: locs }, { data: items }, { data: sqMap }] = await Promise.all([
        supabase.from('locations').select('id,name,week_start_day,operating_days,is_summer_schedule').order('name'),
        supabase.from('menu_items').select('id,name,code,sort_order').order('sort_order'),
        supabase.from('square_locations').select('app_location_id,square_location_id'),
      ])
      const mapping: Record<string,string> = {}
      for (const m of sqMap ?? []) mapping[m.app_location_id] = m.square_location_id
      setSquareLocMap(mapping)
      const locList = (locs ?? []) as Location[]
      setLocations(locList)
      setMenuItems((items ?? []) as MenuItem[])
      const defaultLoc = locList.find(l => !l.name.toLowerCase().includes('newport')) ?? locList[0]
      if (defaultLoc) {
        setLocationId(defaultLoc.id)
        const snapped = snapToWeekStart(new Date(), defaultLoc.week_start_day)
        setWeekStart(format(snapped, 'yyyy-MM-dd'))
      }
    }
    init()
  }, [])

  // ─── Load orders + AI note ────────────────────────────────────────────────
  // Load accuracy history when location changes
  useEffect(() => {
    if (!locationId) return
    fetch(`/api/forecast-accuracy?location_id=${locationId}&limit=8`)
      .then(r => r.json()).then(d => setAccuracy(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [locationId])

  const loadOrders = useCallback(async () => {
    if (!locationId || !weekStart) return
    setLoading(true)
    try {
      const [{ data }, { data: noteData }] = await Promise.all([
        supabase.from('planned_orders').select('*')
          .eq('location_id', locationId).eq('week_start', weekStart),
        supabase.from('planned_order_notes').select('notes')
          .eq('location_id', locationId).eq('week_start', weekStart)
          .maybeSingle(),
      ])

      const map: Record<string, OrderRow> = {}
      for (const item of menuItems) {
        const existing = (data ?? []).find(r => r.menu_item_id === item.id)
        map[item.id] = existing ?? {
          location_id: locationId, menu_item_id: item.id, week_start: weekStart,
          mon:0, tue:0, wed:0, thu:0, fri:0, sat:0, sun:0,
        }
      }
      setOrders(map)

      if (noteData?.notes) {
        setAiNote(noteData.notes)
        setShowNote(true)
      } else {
        setAiNote('')
        setShowNote(false)
      }
    } finally {
      setLoading(false)
    }
  }, [locationId, weekStart, menuItems])

  useEffect(() => { loadOrders() }, [loadOrders])

  // ─── Week navigation ──────────────────────────────────────────────────────
  const shiftWeek = (delta: number) => {
    const d    = parseISO(weekStart)
    const next = addDays(d, delta * 7)
    setWeekStart(format(next, 'yyyy-MM-dd'))
  }

  const handleDatePick = (dateStr: string) => {
    const snapped = snapToWeekStart(new Date(dateStr + 'T12:00:00'), weekStartDay)
    setWeekStart(format(snapped, 'yyyy-MM-dd'))
  }

  const handleLocationChange = (id: string) => {
    setLocationId(id)
    const loc = locations.find(l => l.id === id)
    if (loc) {
      const snapped = snapToWeekStart(new Date(), loc.week_start_day)
      setWeekStart(format(snapped, 'yyyy-MM-dd'))
    }
  }

  // ─── Toggle summer schedule ───────────────────────────────────────────────
  const toggleSummer = async () => {
    if (!location) return
    const isSummer = !location.is_summer_schedule
    const newDays  = isSummer
      ? ['mon','wed','thu','fri','sat','sun']
      : ['wed','thu','fri','sat','sun']
    await supabase.from('locations').update({
      is_summer_schedule: isSummer,
      operating_days: newDays,
    }).eq('id', locationId)
    setLocations(ls => ls.map(l =>
      l.id === locationId ? { ...l, is_summer_schedule: isSummer, operating_days: newDays } : l
    ))
    toast.success(isSummer ? '☀️ Summer schedule on' : '🌙 Winter schedule')
  }

  // ─── AI Forecast ──────────────────────────────────────────────────────────
  const handleAiForecast = async () => {
    if (!location || !weekStart) return
    setForecasting(true)
    try {
      const res = await fetch('/api/ai-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id:    locationId,
          week_start:     weekStart,
          location_name:  location.name,
          operating_days: operatingDays,
          week_start_day: weekStartDay,
          menu_items:     menuItems.map(m => ({ id: m.id, code: m.code, name: m.name })),
        }),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        toast.error(json.error ?? 'AI forecast failed')
        return
      }

      const { forecast, note } = json

      // Map forecast (keyed by item code) back to orders state (keyed by item id)
      setOrders(prev => {
        const next = { ...prev }
        for (const item of menuItems) {
          const itemForecast = forecast[item.code]
          if (!itemForecast) continue
          next[item.id] = {
            ...next[item.id],
            mon: itemForecast.mon ?? 0,
            tue: itemForecast.tue ?? 0,
            wed: itemForecast.wed ?? 0,
            thu: itemForecast.thu ?? 0,
            fri: itemForecast.fri ?? 0,
            sat: itemForecast.sat ?? 0,
            sun: itemForecast.sun ?? 0,
          }
        }
        return next
      })

      setAiNote(note)
      setShowNote(true)
      toast.success('AI forecast applied — review and save when ready')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setForecasting(false)
    }
  }

  // ─── Edit cell ────────────────────────────────────────────────────────────
  const updateCell = (menuItemId: string, day: DayKey, value: string) => {
    const num = Math.max(0, parseInt(value) || 0)
    setOrders(prev => ({ ...prev, [menuItemId]: { ...prev[menuItemId], [day]: num } }))
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true)
    try {
      const rows = Object.values(orders)
      const { error } = await supabase
        .from('planned_orders')
        .upsert(
          rows.map(r => ({ ...r, week_start: weekStart, location_id: locationId })),
          { onConflict: 'location_id,menu_item_id,week_start' }
        )
      if (error) throw error

      // Save adjusted forecast to accuracy tracker
      const savedForecast: Record<string, Record<string, number>> = {}
      let savedTotal = 0
      for (const item of menuItems) {
        const row = orders[item.id]
        if (!row) continue
        savedForecast[item.code] = { mon: row.mon, tue: row.tue, wed: row.wed, thu: row.thu, fri: row.fri, sat: row.sat, sun: row.sun }
        savedTotal += visibleDays.reduce((s, d) => s + (row[d] ?? 0), 0)
      }
      fetch('/api/forecast-accuracy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'saved', location_id: locationId, week_start: weekStart, saved_forecast: savedForecast, saved_total_plates: savedTotal }),
      }).catch(() => {})

      toast.success('Orders saved!')
      loadOrders()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ─── Close Week ────────────────────────────────────────────────────────────
  const closeWeek = async () => {
    const squareLocId = squareLocMap[locationId]
    if (!squareLocId) { toast.error('Square location not mapped — check Income Statement → Square Setup'); return }
    if (!confirm(`Lock actuals from Square for week of ${weekStart}?`)) return
    setClosingWeek(true)
    try {
      const res = await fetch('/api/forecast-accuracy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'close', location_id: locationId, week_start: weekStart, square_location_id: squareLocId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(`Week closed — actual ~${data.actualEstPlates} plates, AI was ${data.aiVariancePct > 0 ? '+' : ''}${data.aiVariancePct}%`)
      // Refresh accuracy
      fetch(`/api/forecast-accuracy?location_id=${locationId}&limit=8`)
        .then(r => r.json()).then(d => setAccuracy(Array.isArray(d) ? d : [])).catch(() => {})
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setClosingWeek(false)
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const weekStartDate = weekStart ? parseISO(weekStart) : new Date()
  const weekEndDate   = addDays(weekStartDate, visibleDays.length - 1)
  const weekLabel     = weekStart
    ? `${format(weekStartDate, 'MMM d')} – ${format(weekEndDate, 'MMM d, yyyy')}`
    : '—'

  const dayTotals  = (day: DayKey) => Object.values(orders).reduce((s, r) => s + (r[day] ?? 0), 0)
  const rowTotal   = (row: OrderRow) => visibleDays.reduce((s, d) => s + (row[d] ?? 0), 0)
  const grandTotal = Object.values(orders).reduce((s, r) => s + rowTotal(r), 0)
  const isLC       = location?.name.toLowerCase().includes('lincoln') || location?.name.toLowerCase().includes('pines')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planned Orders"
        sub="Weekly sales forecast by location"
        action={
          <div className="flex items-center gap-2">
            {weekStart < new Date().toISOString().split('T')[0] && (
              <button
                onClick={closeWeek}
                disabled={closingWeek}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {closingWeek ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Close Week
              </button>
            )}
            <button
              onClick={handleAiForecast}
              disabled={forecasting || !weekStart}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {forecasting
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Forecasting…</>
                : <><Sparkles className="w-4 h-4" /> AI Forecast</>
              }
            </button>
            <button
              onClick={save}
              disabled={saving || !weekStart}
              className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        }
      />

      {/* Controls */}
      <Card>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Location</label>
            <select
              value={locationId}
              onChange={e => handleLocationChange(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500"
            >
              {locations.filter(l => !l.name.toLowerCase().includes('newport')).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => shiftWeek(-1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date" value={weekStart}
              onChange={e => handleDatePick(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500"
            />
            <button onClick={() => shiftWeek(1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="text-sm font-medium text-gray-700 bg-green-50 px-3 py-1.5 rounded-lg">
            {weekLabel}
            {location && (
              <span className="ml-2 text-xs text-gray-400">
                ({visibleDays.length} days · starts {weekStartDay.slice(0,3)})
              </span>
            )}
          </div>

          {isLC && (
            <button
              onClick={toggleSummer}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                location?.is_summer_schedule
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {location?.is_summer_schedule
                ? <><Sun className="w-3.5 h-3.5" /> Summer (Mon on)</>
                : <><Moon className="w-3.5 h-3.5" /> Winter (Mon off)</>
              }
            </button>
          )}
        </div>
      </Card>

      {/* AI forecast note */}
      {showNote && aiNote && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-purple-700 mb-1">AI Forecast Reasoning</div>
            <p className="text-sm text-purple-800 leading-relaxed">{aiNote}</p>
            <p className="text-xs text-purple-500 mt-1">Review numbers above, edit any if needed, then click Save.</p>
          </div>
          <button onClick={() => setShowNote(false)} className="text-purple-400 hover:text-purple-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Orders table */}
      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Item</th>
                  {visibleDays.map(day => {
                    const dayDate = getDayDate(weekStartDate, weekStartDay, day)
                    return (
                      <th key={day} className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-16">
                        <div>{ALL_DAYS.find(d => d.key === day)?.label}</div>
                        <div className="text-gray-400 font-normal normal-case">{format(dayDate, 'M/d')}</div>
                      </th>
                    )
                  })}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {menuItems.map(item => {
                  const row = orders[item.id]
                  if (!row) return null
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-800 text-xs">{item.name}</div>
                        <div className="text-xs text-gray-400">{item.code}</div>
                      </td>
                      {visibleDays.map(day => (
                        <td key={day} className="px-2 py-2 text-center">
                          <input
                            type="number" min="0"
                            value={row[day] || ''}
                            placeholder="0"
                            onChange={e => updateCell(item.id, day, e.target.value)}
                            className="w-14 text-center text-sm border border-gray-200 rounded-lg px-1 py-1.5 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2 text-center">
                        <span className={`text-sm font-bold ${rowTotal(row) > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                          {rowTotal(row)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Day Total</td>
                  {visibleDays.map(day => (
                    <td key={day} className="px-2 py-3 text-center">
                      <span className={`text-sm font-bold ${dayTotals(day) > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                        {dayTotals(day) || '—'}
                      </span>
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold text-green-700">{grandTotal}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Accuracy history panel */}
      {accuracy.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-semibold text-gray-700">AI Forecast Accuracy</span>
            <span className="text-xs text-gray-400">({accuracy.length} closed weeks)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="text-left pb-1.5 pr-4">Week</th>
                  <th className="text-right pb-1.5 px-3">AI Forecast</th>
                  <th className="text-right pb-1.5 px-3">You Saved</th>
                  <th className="text-right pb-1.5 px-3">Actual</th>
                  <th className="text-right pb-1.5 pl-3">AI Variance</th>
                </tr>
              </thead>
              <tbody>
                {accuracy.map(r => {
                  const aiV = Number(r.ai_variance_pct)
                  const varColor = Math.abs(aiV) <= 5 ? 'text-green-600' : Math.abs(aiV) <= 15 ? 'text-amber-600' : 'text-red-600'
                  return (
                    <tr key={r.week_start} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 pr-4 text-gray-600">{r.week_start}</td>
                      <td className="py-1.5 px-3 text-right text-gray-600">{r.ai_total_plates ?? '—'}</td>
                      <td className="py-1.5 px-3 text-right text-gray-600">{r.saved_total_plates ?? '—'}</td>
                      <td className="py-1.5 px-3 text-right font-medium text-gray-800">~{r.actual_est_plates}</td>
                      <td className={`py-1.5 pl-3 text-right font-semibold ${varColor}`}>
                        {aiV > 0 ? '+' : ''}{aiV}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {accuracy.length >= 3 && (() => {
            const avg = Math.round(accuracy.reduce((s, r) => s + Number(r.ai_variance_pct), 0) / accuracy.length)
            return (
              <p className="text-xs text-gray-400 mt-2">
                Avg AI variance: <span className={`font-semibold ${Math.abs(avg) <= 5 ? 'text-green-600' : 'text-amber-600'}`}>{avg > 0 ? '+' : ''}{avg}%</span>
                {Math.abs(avg) > 5 && ` — AI is systematically ${avg > 0 ? 'over' : 'under'}forecasting, it will self-correct next time`}
              </p>
            )
          })()}
        </div>
      )}

      {location && (
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>Operating days this week:</span>
          {ALL_DAYS.map(({ key, label }) => (
            <span key={key} className={`px-2 py-0.5 rounded-full ${
              operatingDays.includes(key)
                ? 'bg-green-100 text-green-700 font-medium'
                : 'bg-gray-100 text-gray-400 line-through'
            }`}>{label}</span>
          ))}
        </div>
      )}
    </div>
  )
}
