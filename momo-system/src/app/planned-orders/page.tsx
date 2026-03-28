'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import WeekSelector from '@/components/ui/WeekSelector'
import LocationSelector from '@/components/ui/LocationSelector'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const DAYS = ['mon','tue','wed','thu','fri','sat','sun']
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function PlannedOrdersPage() {
  const [locationId, setLocationId] = useState('')
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(),{weekStartsOn:1}),'yyyy-MM-dd'))
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [orders, setOrders] = useState<Record<string,Record<string,number>>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    import('@/lib/supabase').then(({supabase}) => {
      supabase.from('menu_items').select('*').order('sort_order').then(({data}) => {
        setMenuItems(data||[])
        const init: Record<string,Record<string,number>> = {}
        for (const m of data||[]) { init[m.code] = {}; for (const d of DAYS) init[m.code][d] = 0 }
        setOrders(init)
      })
    })
  }, [])

  const loadOrders = useCallback(async () => {
    if (!locationId || !weekStart || !menuItems.length) return
    setLoading(true)
    const res = await fetch(`/api/planned-orders?location_id=${locationId}&week_start=${weekStart}`)
    const data = await res.json()
    const newOrders: Record<string,Record<string,number>> = {}
    for (const m of menuItems) { newOrders[m.code] = {}; for (const d of DAYS) newOrders[m.code][d] = 0 }
    for (const row of data||[]) {
      const code = row.menu_items?.code
      if (code) for (const d of DAYS) newOrders[code][d] = row[d]||0
    }
    setOrders(newOrders)
    setLoading(false)
  }, [locationId, weekStart, menuItems])

  useEffect(() => { loadOrders() }, [locationId, weekStart, menuItems.length])

  const handleChange = (code: string, day: string, val: string) => {
    setOrders(prev => ({ ...prev, [code]: { ...prev[code], [day]: Number(val)||0 } }))
  }

  const save = async () => {
    if (!locationId) return toast.error('Select a location first')
    setSaving(true)
    const body = menuItems.map(m => ({
      location_id: locationId, menu_item_id: m.id, week_start: weekStart, ...orders[m.code]
    }))
    const res = await fetch('/api/planned-orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    if (res.ok) toast.success('Orders saved!')
    else toast.error('Failed to save')
    setSaving(false)
  }

  const weeklyTotal = (code: string) => DAYS.reduce((s,d) => s+(orders[code]?.[d]||0), 0)
  const dayTotal = (day: string) => menuItems.reduce((s,m) => s+(orders[m.code]?.[day]||0), 0)
  const grandTotal = () => menuItems.reduce((s,m) => s+weeklyTotal(m.code), 0)

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Planned Orders"
        sub="Enter expected orders per day"
        action={
          <button onClick={save} disabled={saving}
            className="px-3 py-2 lg:px-4 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <LocationSelector onChange={setLocationId} />
        <WeekSelector onChange={setWeekStart} />
      </div>

      {loading ? <LoadingSpinner /> : (
        <Card className="p-0 overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-max">
              <thead>
                <tr className="bg-brand-900 text-white">
                  <th className="text-left px-3 py-3 text-xs font-medium sticky left-0 bg-brand-900 min-w-28">Item</th>
                  {DAY_LABELS.map(d => <th key={d} className="text-center px-2 py-3 text-xs font-medium w-14">{d}</th>)}
                  <th className="text-center px-3 py-3 text-xs font-medium w-16">Total</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((m, i) => (
                  <tr key={m.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                    <td className="px-3 py-2 text-xs font-medium text-gray-800 sticky left-0 bg-inherit">{m.name}</td>
                    {DAYS.map(d => (
                      <td key={d} className="px-1 py-1.5 text-center">
                        <input type="number" min="0" inputMode="numeric"
                          value={orders[m.code]?.[d]||0}
                          onChange={e => handleChange(m.code, d, e.target.value)}
                          className="w-12 text-center text-sm border border-blue-200 bg-blue-50 text-blue-800 font-semibold rounded-md px-1 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <span className="text-sm font-bold text-brand-700">{weeklyTotal(m.code)}</span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-brand-50 border-t-2 border-brand-200">
                  <td className="px-3 py-2 text-xs font-bold text-brand-800 sticky left-0 bg-brand-50">Total</td>
                  {DAYS.map(d => <td key={d} className="px-2 py-2 text-center text-xs font-bold text-brand-700">{dayTotal(d)}</td>)}
                  <td className="px-3 py-2 text-center text-xs font-bold text-brand-800">{grandTotal()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}