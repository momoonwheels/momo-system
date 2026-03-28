'use client'
import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LocationSelector from '@/components/ui/LocationSelector'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { Truck, ClipboardCheck, History, Plus, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const TODAY = format(new Date(), 'yyyy-MM-dd')

type Tab = 'current' | 'delivery' | 'history'

export default function TruckInventoryPage() {
  const [locationId, setLocationId] = useState('')
  const [tab, setTab] = useState<Tab>('current')
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [current, setCurrent] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Count entry state
  const [counts, setCounts] = useState<Record<string,number>>({})
  const [countType, setCountType] = useState<'count'|'verified'>('count')
  const [countNotes, setCountNotes] = useState('')

  // Delivery entry state
  const [delivery, setDelivery] = useState<Record<string,number>>({})
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(selectedDate)

  const isToday = selectedDate === TODAY

  const loadCurrent = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    let data: any[]
    if (isToday) {
      const res = await fetch(`/api/truck-inventory-log?view=current&location_id=${locationId}`)
      data = await res.json()
    } else {
      // For past dates: get entries for that specific date
      const res = await fetch(`/api/truck-inventory-log?location_id=${locationId}&log_date=${selectedDate}`)
      const logs = await res.json()
      // Also get current view for package metadata
      const metaRes = await fetch(`/api/truck-inventory-log?view=current&location_id=${locationId}`)
      const meta = await metaRes.json()
      // Build a map of package data with quantities from selected date
      const logMap: Record<string, any> = {}
      for (const log of (Array.isArray(logs) ? logs : [])) {
        const pkgId = log.package_id
        if (!logMap[pkgId]) logMap[pkgId] = { deliveries: 0, count: null, verified: null }
        if (log.log_type === 'delivery') logMap[pkgId].deliveries += Number(log.quantity)
        if (log.log_type === 'count') logMap[pkgId].count = Number(log.quantity)
        if (log.log_type === 'verified') logMap[pkgId].verified = Number(log.quantity)
      }
      // Merge with metadata
      data = (Array.isArray(meta) ? meta : []).map((row: any) => ({
        ...row,
        todays_delivery: logMap[row.package_id]?.deliveries || 0,
        today_count_qty: logMap[row.package_id]?.verified ?? logMap[row.package_id]?.count ?? null,
        current_on_hand: logMap[row.package_id]?.verified ?? logMap[row.package_id]?.count ?? row.last_count_qty ?? 0,
      }))
    }
    setCurrent(Array.isArray(data) ? data : [])
    const c: Record<string,number> = {}
    for (const row of (Array.isArray(data) ? data : [])) {
      c[row.package_id] = Number(row.current_on_hand) || 0
    }
    setCounts(c)
    setLoading(false)
  }, [locationId, selectedDate, isToday])

  const loadHistory = useCallback(async () => {
    if (!locationId) return
    const res = await fetch(`/api/truck-inventory-log?location_id=${locationId}&days=14`)
    const data = await res.json()
    setHistory(Array.isArray(data) ? data : [])
  }, [locationId])

  useEffect(() => {
    if (locationId) { loadCurrent(); loadHistory() }
  }, [locationId, selectedDate])

  // Save night count or morning verify
  const saveCount = async () => {
    if (!locationId) return toast.error('Select a location')
    setSaving(true)
    const items = current.map(row => ({
      location_id: locationId,
      package_id: row.package_id,
      log_date: selectedDate,
      log_type: countType,
      quantity: counts[row.package_id] || 0,
      notes: countNotes,
      created_by: 'truck_staff'
    }))
    const res = await fetch('/api/truck-inventory-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    })
    if (res.ok) {
      toast.success(countType === 'count' ? 'Night count saved!' : 'Morning verification saved!')
      setCountNotes('')
      loadCurrent()
      loadHistory()
    } else toast.error('Failed to save')
    setSaving(false)
  }

  // Save delivery
  const saveDelivery = async () => {
    if (!locationId) return toast.error('Select a location')
    const hasItems = Object.values(delivery).some(v => v > 0)
    if (!hasItems) return toast.error('Enter at least one package quantity')
    setSaving(true)
    const items = current
      .filter(row => (delivery[row.package_id] || 0) > 0)
      .map(row => ({
        location_id: locationId,
        package_id: row.package_id,
        log_date: deliveryDate,
        log_type: 'delivery',
        quantity: delivery[row.package_id] || 0,
        notes: deliveryNotes || 'Delivery',
        created_by: 'truck_staff'
      }))
    const res = await fetch('/api/truck-inventory-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    })
    if (res.ok) {
      toast.success('Delivery logged!')
      setDelivery({})
      setDeliveryNotes('')
      loadCurrent()
      loadHistory()
      setTab('current')
    } else toast.error('Failed to save')
    setSaving(false)
  }

  // Group current by container
  const grouped = current.reduce((acc: Record<string,any[]>, row) => {
    const cont = row.container_code || 'Other'
    if (!acc[cont]) acc[cont] = []
    acc[cont].push(row)
    return acc
  }, {})

  // Group history by date
  const historyByDate = history.reduce((acc: Record<string,any[]>, row) => {
    if (!acc[row.log_date]) acc[row.log_date] = []
    acc[row.log_date].push(row)
    return acc
  }, {})

  const tabCls = (t: Tab) => `flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
    tab === t ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
  }`

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Truck Inventory"
        sub={isToday ? `Today · ${format(new Date(), 'EEEE, MMM d, yyyy')}` : `Viewing ${format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMM d, yyyy')}`}
      />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <LocationSelector onChange={setLocationId} filter="food_truck" />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              max={TODAY}
              onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {!isToday && (
              <button onClick={() => setSelectedDate(TODAY)}
                className="text-xs text-brand-600 hover:text-brand-700 underline">
                Back to today
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('current')} className={tabCls('current')}><Truck className="w-4 h-4" />{isToday ? 'Current & Count' : format(new Date(selectedDate + 'T12:00:00'), 'MMM d') + ' View'}</button>
          <button onClick={() => setTab('delivery')} className={tabCls('delivery')}><Plus className="w-4 h-4" />Add Delivery</button>
          <button onClick={() => setTab('history')} className={tabCls('history')}><History className="w-4 h-4" />History</button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* ── CURRENT & COUNT TAB ─────────────────────────────── */}
          {tab === 'current' && (
            <div className="space-y-4">
              {/* Status banner */}
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-brand-800">
                    {isToday ? `Current Inventory Snapshot — ${format(new Date(), 'EEEE, MMM d')}` : `Historical View — ${format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMM d, yyyy')}`}
                  </p>
                  <p className="text-xs text-brand-500 mt-0.5">
                    Based on last physical count + today's deliveries. Enter night count below to update.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <select value={countType} onChange={e => setCountType(e.target.value as any)}
                    className="text-sm border border-brand-200 rounded-lg px-3 py-1.5 bg-white">
                    <option value="count">🌙 Night Count</option>
                    <option value="verified">☀️ Morning Verify</option>
                  </select>
                </div>
              </div>

              {Object.entries(grouped).map(([container, rows]) => (
                <Card key={container} className="p-0 overflow-hidden">
                  <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm">
                    {container} Container
                  </div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                        <th className="text-left px-4 py-2">Package</th>
                        <th className="text-left px-4 py-2">Contents</th>
                        <th className="text-center px-4 py-2">Last Count</th>
                        <th className="text-center px-4 py-2 text-green-600">Today's Delivery</th>
                        <th className="text-center px-4 py-2 text-brand-700">Current On Hand</th>
                        <th className="text-center px-4 py-2 text-blue-600">
                          {countType === 'count' ? '🌙 Night Count' : '☀️ Morning Verify'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as any[]).map((row, i) => {
                        const hasCountToday = !!row.today_count_qty
                        return (
                          <tr key={row.package_id} className={i%2===0?'bg-white':'bg-gray-50'}>
                            <td className="px-4 py-2.5 text-sm font-mono font-bold text-brand-700">{row.code}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-700">{row.contents}</td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="text-sm text-gray-600">{Number(row.last_count_qty)||0}</div>
                              {row.count_date && <div className="text-xs text-gray-400">{row.count_date}</div>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {Number(row.todays_delivery) > 0 ? (
                                <span className="text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                                  +{Number(row.todays_delivery)}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                                hasCountToday ? 'bg-blue-100 text-blue-800' : 'bg-brand-100 text-brand-800'
                              }`}>
                                {Number(row.current_on_hand)||0}
                                {hasCountToday && <span className="ml-1 text-xs">✓</span>}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <input
                                type="number" min="0"
                                value={counts[row.package_id] ?? Number(row.current_on_hand) ?? 0}
                                onChange={e => setCounts(prev => ({ ...prev, [row.package_id]: Number(e.target.value)||0 }))}
                                className="w-20 text-center text-sm border border-blue-200 bg-blue-50 text-blue-800 font-semibold rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </Card>
              ))}

              <div className="flex items-center gap-4 justify-end">
                <input type="text" placeholder="Notes (optional)"
                  value={countNotes} onChange={e => setCountNotes(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64" />
                <button onClick={saveCount} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                  <ClipboardCheck className="w-4 h-4" />
                  {saving ? 'Saving...' : countType === 'count' ? 'Save Night Count' : 'Save Verification'}
                </button>
              </div>
            </div>
          )}

          {/* ── ADD DELIVERY TAB ────────────────────────────────── */}
          {tab === 'delivery' && (
            <div className="space-y-4">
              <Card>
                <div className="flex items-center gap-4 mb-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Delivery Date</label>
                    <input type="date" value={deliveryDate}
                      onChange={e => setDeliveryDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
                    <input type="text" placeholder="e.g. Regular Wed delivery / Off-cycle emergency"
                      value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                  💡 Enter only packages that were delivered. Leave others as 0. These will be added to current on hand.
                </p>
              </Card>

              {Object.entries(grouped).map(([container, rows]) => (
                <Card key={container} className="p-0 overflow-hidden">
                  <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm">
                    {container} Container
                  </div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                        <th className="text-left px-4 py-2">Package</th>
                        <th className="text-left px-4 py-2">Contents</th>
                        <th className="text-center px-4 py-2">Current On Hand</th>
                        <th className="text-center px-4 py-2 text-green-600">Packages Delivered ← enter</th>
                        <th className="text-center px-4 py-2 text-brand-700">New Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows as any[]).map((row, i) => {
                        const del = delivery[row.package_id] || 0
                        const newTotal = Number(row.current_on_hand) + del
                        return (
                          <tr key={row.package_id} className={i%2===0?'bg-white':'bg-gray-50'}>
                            <td className="px-4 py-2.5 text-sm font-mono font-bold text-brand-700">{row.code}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-700">{row.contents}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="text-sm font-medium text-gray-600">{Number(row.current_on_hand)||0}</span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <input
                                type="number" min="0"
                                value={del || ''}
                                placeholder="0"
                                onChange={e => setDelivery(prev => ({ ...prev, [row.package_id]: Number(e.target.value)||0 }))}
                                className="w-20 text-center text-sm border border-green-200 bg-green-50 text-green-800 font-semibold rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {del > 0 ? (
                                <span className="text-sm font-bold text-brand-700 bg-brand-50 px-3 py-1 rounded-full">{newTotal}</span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </Card>
              ))}

              <div className="flex justify-end">
                <button onClick={saveDelivery} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  <Plus className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Log Delivery'}
                </button>
              </div>
            </div>
          )}

          {/* ── HISTORY TAB ─────────────────────────────────────── */}
          {tab === 'history' && (
            <div className="space-y-4">
              {Object.keys(historyByDate).length === 0 ? (
                <Card>
                  <div className="text-center py-12 text-gray-400">No history yet for this location</div>
                </Card>
              ) : Object.entries(historyByDate).map(([date, entries]) => (
                <Card key={date} className="p-0 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-800 text-white font-semibold text-sm flex items-center justify-between">
                    <span>{format(new Date(date + 'T12:00:00'), 'EEEE, MMM d, yyyy')}</span>
                    <div className="flex gap-2 text-xs">
                      {(entries as any[]).some(e=>e.log_type==='delivery') && <span className="bg-green-600 px-2 py-0.5 rounded-full">📦 Delivery</span>}
                      {(entries as any[]).some(e=>e.log_type==='count') && <span className="bg-blue-600 px-2 py-0.5 rounded-full">🌙 Count</span>}
                      {(entries as any[]).some(e=>e.log_type==='verified') && <span className="bg-purple-600 px-2 py-0.5 rounded-full">☀️ Verified</span>}
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                        <th className="text-left px-4 py-2">Time</th>
                        <th className="text-left px-4 py-2">Type</th>
                        <th className="text-left px-4 py-2">Package</th>
                        <th className="text-center px-4 py-2">Qty</th>
                        <th className="text-left px-4 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(entries as any[]).map((entry, i) => (
                        <tr key={entry.id} className={i%2===0?'bg-white':'bg-gray-50'}>
                          <td className="px-4 py-2 text-xs text-gray-400">
                            {format(new Date(entry.created_at), 'h:mm a')}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              entry.log_type==='delivery' ? 'bg-green-100 text-green-700' :
                              entry.log_type==='verified' ? 'bg-purple-100 text-purple-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {entry.log_type==='delivery'?'📦 Delivery':entry.log_type==='verified'?'☀️ Verified':'🌙 Count'}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <span className="font-mono text-xs text-brand-700 font-bold">{entry.packages?.code}</span>
                            <span className="text-gray-500 ml-2 text-xs">{entry.packages?.name}</span>
                          </td>
                          <td className="px-4 py-2 text-center font-semibold text-gray-800">{entry.quantity}</td>
                          <td className="px-4 py-2 text-xs text-gray-400">{entry.notes||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
