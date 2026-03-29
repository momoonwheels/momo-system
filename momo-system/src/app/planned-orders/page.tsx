'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, addDays, parseISO, startOfWeek, nextWednesday, nextThursday, isBefore, isAfter } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ChevronLeft, ChevronRight, Save, RefreshCw, Sun, Moon } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Location {
  id: string
  name: string
  week_start_day: string   // 'wednesday' | 'thursday' | 'monday'
  operating_days: string[] // e.g. ['wed','thu','fri','sat','sun']
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

// ─── Day config ───────────────────────────────────────────────────────────────
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

// Get the ordered days for a location's week (starts on their week_start_day)
function getOrderedDays(weekStartDay: string): DayKey[] {
  const order: DayKey[] = ['mon','tue','wed','thu','fri','sat','sun']
  const startIdx = {
    monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
    friday: 4, saturday: 5, sunday: 6,
  }[weekStartDay] ?? 0
  return [...order.slice(startIdx), ...order.slice(0, startIdx)]
}

// Snap a date to the nearest past week_start_day for a location
function snapToWeekStart(date: Date, weekStartDay: string): Date {
  const dayNum = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
    friday: 5, saturday: 6, sunday: 0,
  }[weekStartDay] ?? 1

  const d = new Date(date)
  const current = d.getDay() // 0=Sun, 1=Mon...
  let diff = current - dayNum
  if (diff < 0) diff += 7
  d.setDate(d.getDate() - diff)
  return d
}

// Get the actual calendar date for a day key given a week_start date
function getDayDate(weekStartDate: Date, weekStartDay: string, dayKey: DayKey): Date {
  const orderedDays = getOrderedDays(weekStartDay)
  const idx = orderedDays.indexOf(dayKey)
  return addDays(weekStartDate, idx)
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PlannedOrdersPage() {
  const [locations, setLocations]   = useState<Location[]>([])
  const [menuItems, setMenuItems]   = useState<MenuItem[]>([])
  const [locationId, setLocationId] = useState<string>('')
  const [weekStart, setWeekStart]   = useState<string>('')
  const [orders, setOrders]         = useState<Record<string, OrderRow>>({})
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)

  const location = locations.find(l => l.id === locationId)
  const operatingDays = location?.operating_days ?? ALL_DAYS.map(d => d.key)
  const weekStartDay  = location?.week_start_day ?? 'monday'
  const orderedDays   = getOrderedDays(weekStartDay)

  // Visible days: ordered by location's week, only operating days shown
  const visibleDays = orderedDays.filter(d => operatingDays.includes(d))

  // ─── Load locations + menu items ──────────────────────────────────────────
  useEffect(() => {
    const fetchRef = async () => {
      const [{ data: locs }, { data: items }] = await Promise.all([
        supabase.from('locations').select('id,name,week_start_day,operating_days,is_summer_schedule').order('name'),
        supabase.from('menu_items').select('id,name,code,sort_order').order('sort_order'),
      ])
      const locList = (locs ?? []) as Location[]
      setLocations(locList)
      setMenuItems((items ?? []) as MenuItem[])

      // Default to first non-Newport location
      const defaultLoc = locList.find(l => !l.name.toLowerCase().includes('newport')) ?? locList[0]
      if (defaultLoc) {
        setLocationId(defaultLoc.id)
        const snapped = snapToWeekStart(new Date(), defaultLoc.week_start_day)
        setWeekStart(format(snapped, 'yyyy-MM-dd'))
      }
    }
    fetchRef()
  }, [])

  // ─── Load orders ──────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!locationId || !weekStart) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('planned_orders')
        .select('*')
        .eq('location_id', locationId)
        .eq('week_start', weekStart)

      const map: Record<string, OrderRow> = {}
      for (const item of menuItems) {
        const existing = (data ?? []).find(r => r.menu_item_id === item.id)
        map[item.id] = existing ?? {
          location_id: locationId,
          menu_item_id: item.id,
          week_start: weekStart,
          mon:0, tue:0, wed:0, thu:0, fri:0, sat:0, sun:0,
        }
      }
      setOrders(map)
    } finally {
      setLoading(false)
    }
  }, [locationId, weekStart, menuItems])

  useEffect(() => { loadOrders() }, [loadOrders])

  // ─── Week navigation ──────────────────────────────────────────────────────
  const shiftWeek = (delta: number) => {
    const d = parseISO(weekStart)
    // For Salem (Thu-Wed), a "week" is 7 days but starts Thursday
    // For LC (Wed-Sun), moving forward goes to next Wednesday
    const daysInWeek = operatingDays.length >= 7 ? 7 : 7 // always shift by 7 calendar days
    const next = addDays(d, delta * 7)
    setWeekStart(format(next, 'yyyy-MM-dd'))
  }

  const handleDatePick = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    const snapped = snapToWeekStart(d, weekStartDay)
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
    // LC summer adds Monday
    const newDays = isSummer
      ? ['mon','wed','thu','fri','sat','sun']
      : ['wed','thu','fri','sat','sun']

    await supabase.from('locations').update({
      is_summer_schedule: isSummer,
      operating_days: newDays,
    }).eq('id', locationId)

    setLocations(ls => ls.map(l =>
      l.id === locationId
        ? { ...l, is_summer_schedule: isSummer, operating_days: newDays }
        : l
    ))
    toast.success(isSummer ? '☀️ Summer schedule on — Mon added' : '🌙 Winter schedule — Mon removed')
  }

  // ─── Edit cell ────────────────────────────────────────────────────────────
  const updateCell = (menuItemId: string, day: DayKey, value: string) => {
    const num = Math.max(0, parseInt(value) || 0)
    setOrders(prev => ({
      ...prev,
      [menuItemId]: { ...prev[menuItemId], [day]: num }
    }))
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true)
    try {
      const rows = Object.values(orders)
      const { error } = await supabase
        .from('planned_orders')
        .upsert(rows.map(r => ({ ...r, week_start: weekStart, location_id: locationId })),
          { onConflict: 'location_id,menu_item_id,week_start' })
      if (error) throw error
      toast.success('Orders saved!')
      loadOrders()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ─── Week label ───────────────────────────────────────────────────────────
  const weekStartDate = weekStart ? parseISO(weekStart) : new Date()
  const weekEndDate   = addDays(weekStartDate, visibleDays.length - 1)
  const weekLabel     = weekStart
    ? `${format(weekStartDate, 'MMM d')} – ${format(weekEndDate, 'MMM d, yyyy')}`
    : '—'

  // Column totals
  const dayTotals = (day: DayKey) =>
    Object.values(orders).reduce((s, r) => s + (r[day] ?? 0), 0)

  // Row total (only operating days)
  const rowTotal = (row: OrderRow) =>
    visibleDays.reduce((s, d) => s + (row[d] ?? 0), 0)

  const grandTotal = Object.values(orders).reduce((s, r) => s + rowTotal(r), 0)

  const isLC = location?.name.toLowerCase().includes('lincoln') ||
               location?.name.toLowerCase().includes('pines')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planned Orders"
        sub="Weekly sales forecast by location"
        action={
          <button
            onClick={save}
            disabled={saving || !weekStart}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        }
      />

      {/* Controls */}
      <Card>
        <div className="flex flex-wrap gap-4 items-center">
          {/* Location picker */}
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

          {/* Week nav */}
          <div className="flex items-center gap-2">
            <button onClick={() => shiftWeek(-1)}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={weekStart}
              onChange={e => handleDatePick(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-green-500"
            />
            <button onClick={() => shiftWeek(1)}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Week label */}
          <div className="text-sm font-medium text-gray-700 bg-green-50 px-3 py-1.5 rounded-lg">
            {weekLabel}
            {location && (
              <span className="ml-2 text-xs text-gray-400">
                ({visibleDays.length} days · starts {weekStartDay.slice(0,3)})
              </span>
            )}
          </div>

          {/* Summer toggle (LC only) */}
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
                            type="number"
                            min="0"
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

      {/* Operating days legend */}
      {location && (
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>Operating days this week:</span>
          {ALL_DAYS.map(({ key, label }) => (
            <span key={key} className={`px-2 py-0.5 rounded-full ${
              operatingDays.includes(key)
                ? 'bg-green-100 text-green-700 font-medium'
                : 'bg-gray-100 text-gray-400 line-through'
            }`}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
