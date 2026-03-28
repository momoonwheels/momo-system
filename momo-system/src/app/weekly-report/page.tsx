'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, startOfWeek, subWeeks } from 'date-fns'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { FileText, Printer, TrendingUp, TrendingDown, Package, DollarSign, BarChart2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function fmt$(n: number) {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-$' : '$') + abs
}
function pct(n: number, total: number) {
  return total > 0 ? (n / total * 100).toFixed(1) + '%' : '0%'
}
function varColor(pct: number) {
  const abs = Math.abs(pct)
  if (abs <= 10) return 'text-green-600 bg-green-50'
  if (abs <= 20) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}
function varIcon(v: number) {
  if (v > 0) return '▲'
  if (v < 0) return '▼'
  return '—'
}

export default function WeeklyReportPage() {
  const [weekStart, setWeekStart] = useState(
    format(startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  )
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<any[]>([])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('locations').select('*').eq('type', 'food_truck').eq('active', true)
      .then(({ data: locs }) => setLocations(locs || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const url = `/api/weekly-report?week_start=${weekStart}${locationId ? `&location_id=${locationId}` : ''}`
    const res = await fetch(url)
    setData(await res.json())
    setLoading(false)
  }, [weekStart, locationId])

  useEffect(() => { load() }, [weekStart, locationId])

  const weekEnd = data?.weekEnd || ''
  const pnl = data?.pnl || {}
  const foodCost = data?.foodCost || {}

  return (
    <div className="p-4 lg:p-8 print:p-6">
      {/* Print header - only shows when printing */}
      <div className="hidden print:flex items-center gap-4 mb-6 pb-4 border-b-2 border-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Momo on the Wheels</h1>
          <p className="text-gray-500 text-sm">Weekly Management Report</p>
        </div>
        <div className="ml-auto text-right text-sm text-gray-600">
          <p className="font-semibold">{weekStart} to {weekEnd}</p>
          <p>{locationId ? locations.find(l=>l.id===locationId)?.name : 'All Locations'}</p>
        </div>
      </div>

      {/* Screen header */}
      <div className="print:hidden">
        <PageHeader
          title="Weekly Management Report"
          sub="Sales, costs, and variance analysis"
          action={
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">
              <Printer className="w-4 h-4" /> Export PDF
            </button>
          }
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Week Starting</label>
          <input type="date" value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Location</label>
          <select value={locationId} onChange={e => setLocationId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Locations (Combined)</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <button onClick={load}
          className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          Refresh
        </button>
      </div>

      {loading ? <LoadingSpinner /> : !data ? null : (
        <div className="space-y-6 print:space-y-4">

          {/* ── KPI SUMMARY ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:grid-cols-4">
            {[
              { label: 'Net Revenue', value: fmt$(pnl.revenue||0), icon: TrendingUp, color: 'green' },
              { label: 'Food Cost', value: fmt$(pnl.foodCost||0), sub: pct(pnl.foodCost||0, pnl.revenue||0) + ' of sales', icon: DollarSign, color: 'yellow' },
              { label: 'Labor Cost', value: fmt$(pnl.laborCost||0), sub: pct(pnl.laborCost||0, pnl.revenue||0) + ' of sales', icon: DollarSign, color: 'blue' },
              { label: 'Net Profit', value: fmt$(pnl.netProfit||0), sub: pct(pnl.netProfit||0, pnl.revenue||0) + ' margin', icon: BarChart2, color: pnl.netProfit >= 0 ? 'brand' : 'red' },
            ].map(k => (
              <div key={k.label} className={`rounded-xl p-4 border ${
                k.color === 'green' ? 'bg-green-50 border-green-100' :
                k.color === 'yellow' ? 'bg-yellow-50 border-yellow-100' :
                k.color === 'blue' ? 'bg-blue-50 border-blue-100' :
                k.color === 'red' ? 'bg-red-50 border-red-100' :
                'bg-brand-50 border-brand-100'
              }`}>
                <p className="text-xs font-medium text-gray-500">{k.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{k.value}</p>
                {k.sub && <p className="text-xs text-gray-500 mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* ── SECTION 1: SALES VARIANCE ──────────────────────────── */}
          <Card className="p-0 overflow-hidden print:shadow-none print:border">
            <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Section 1 — Sales Performance
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Menu Item</th>
                  <th className="text-center px-4 py-2">Planned</th>
                  <th className="text-center px-4 py-2">Actual</th>
                  <th className="text-center px-4 py-2">Variance</th>
                  <th className="text-center px-4 py-2">Variance %</th>
                  <th className="text-center px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data.salesVariance||[]).map((row:any, i:number) => (
                  <tr key={row.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{row.label}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-gray-600">{row.planned}</td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-800">{row.actual}</td>
                    <td className="px-4 py-2.5 text-center text-sm">
                      <span className={row.variance >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {varIcon(row.variance)} {Math.abs(row.variance)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm">
                      <span className={row.variancePct >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {row.variancePct >= 0 ? '+' : ''}{row.variancePct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + varColor(row.variancePct)}>
                        {Math.abs(row.variancePct) <= 10 ? '✓ On Track' :
                         Math.abs(row.variancePct) <= 20 ? '⚠ Watch' : '✗ Off Track'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-brand-50 font-bold border-t-2 border-brand-200">
                  <td className="px-4 py-2.5 text-sm">Total Orders</td>
                  <td className="px-4 py-2.5 text-center text-sm">{Number(Object.values(data.plannedByMenu||{}).reduce((s:any,v:any)=>s+v,0))}</td>
                  <td className="px-4 py-2.5 text-center text-sm">{data.orderCount||0}</td>
                  <td colSpan={3} className="px-4 py-2.5 text-center text-xs text-gray-400">
                    🟢 ±10%  🟡 10-20%  🔴 {'>'}20%
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </Card>

          {/* ── SECTION 2: PACKAGE VARIANCE ────────────────────────── */}
          <Card className="p-0 overflow-hidden print:shadow-none print:border">
            <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm flex items-center gap-2">
              <Package className="w-4 h-4" /> Section 2 — Package / Inventory Variance
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Package</th>
                  <th className="text-center px-4 py-2">Sent to Truck</th>
                  <th className="text-center px-4 py-2">Used (by sales)</th>
                  <th className="text-center px-4 py-2">Leftover</th>
                  <th className="text-center px-4 py-2">Leftover %</th>
                  <th className="text-center px-4 py-2">Est. Cost/Pkg</th>
                </tr>
              </thead>
              <tbody>
                {(data.packageVariance||[]).map((row:any, i:number) => (
                  <tr key={row.code} className={i%2===0?'bg-white':'bg-gray-50'}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-bold text-brand-700">{row.code}</span>
                      <span className="text-xs text-gray-500 ml-2">{row.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm font-semibold">{row.sent}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-gray-600">{row.used}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={row.leftover > 0 ? 'text-blue-600 font-semibold' : 'text-gray-400'}>
                        {row.leftover > 0 ? '+' : ''}{row.leftover}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm text-gray-500">
                      {row.variancePct.toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                      {data.costPerPackage?.[row.code] ? fmt$(data.costPerPackage[row.code]) + '/order' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>

          {/* ── SECTION 3: FOOD COST VARIANCE ──────────────────────── */}
          <Card className="p-0 overflow-hidden print:shadow-none print:border">
            <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Section 3 — Food Cost Variance
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Item</th>
                  <th className="text-center px-4 py-2">Theoretical (Recipe × Sales)</th>
                  <th className="text-center px-4 py-2">Actual (Receipts)</th>
                  <th className="text-center px-4 py-2">Variance</th>
                  <th className="text-center px-4 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className="px-4 py-2.5 text-sm font-medium">Food Cost</td>
                  <td className="px-4 py-2.5 text-center text-sm">{fmt$(foodCost.theoretical||0)}</td>
                  <td className="px-4 py-2.5 text-center text-sm font-semibold">{fmt$(foodCost.actual||0)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={(foodCost.variance||0) > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                      {(foodCost.variance||0) >= 0 ? '+' : ''}{fmt$(foodCost.variance||0)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                    {(foodCost.variance||0) > 0 ? 'Bought more than needed' :
                     (foodCost.variance||0) < 0 ? 'Efficient purchasing' : 'On target'}
                  </td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium">Food Cost %</td>
                  <td className="px-4 py-2.5 text-center text-sm">{pct(foodCost.theoretical||0, pnl.revenue||0)}</td>
                  <td className="px-4 py-2.5 text-center text-sm font-semibold">{pct(foodCost.actual||0, pnl.revenue||0)}</td>
                  <td className="px-4 py-2.5 text-center text-sm text-gray-500" colSpan={2}>of net revenue</td>
                </tr>
              </tbody>
            </table>
            </div>
          </Card>

          {/* ── SECTION 4: P&L SUMMARY ─────────────────────────────── */}
          <Card className="print:shadow-none print:border">
            <div className="flex items-center gap-2 font-semibold text-gray-900 mb-4">
              <FileText className="w-4 h-4 text-brand-600" /> Section 4 — P&L Summary
            </div>
            <div className="space-y-2 max-w-md">
              {[
                { label: 'Gross Revenue', val: pnl.grossRevenue||0, cls: 'text-gray-800' },
                { label: 'Refunds', val: -(pnl.refunds||0), cls: 'text-red-500', indent: true },
                { label: 'Net Revenue', val: pnl.revenue||0, cls: 'text-gray-900 font-bold', border: true },
                { label: 'Food Cost', val: -(pnl.foodCost||0), cls: 'text-red-600', indent: true, sub: pct(pnl.foodCost||0, pnl.revenue||0) },
                { label: 'Gross Profit', val: pnl.grossProfit||0, cls: 'text-blue-700 font-bold', border: true },
                { label: 'Labor', val: -(pnl.laborCost||0), cls: 'text-red-600', indent: true, sub: pct(pnl.laborCost||0, pnl.revenue||0) },
                { label: 'Other Expenses', val: -(pnl.otherExpenses||0), cls: 'text-red-600', indent: true },
                { label: 'Net Profit', val: pnl.netProfit||0, cls: (pnl.netProfit||0)>=0 ? 'text-green-700 font-bold text-lg' : 'text-red-700 font-bold text-lg', border: true, sub: pct(pnl.netProfit||0, pnl.revenue||0) + ' margin' },
              ].map((row,i) => (
                <div key={i} className={`flex justify-between items-center py-1.5 ${row.border ? 'border-t-2 border-gray-200 mt-2 pt-2' : ''}`}>
                  <span className={`text-sm ${row.indent ? 'ml-4 text-gray-600' : 'text-gray-800'}`}>
                    {row.label}
                    {row.sub && <span className="text-xs text-gray-400 ml-2">({row.sub})</span>}
                  </span>
                  <span className={`text-sm ${row.cls}`}>{fmt$(row.val)}</span>
                </div>
              ))}
            </div>
          </Card>

        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { font-size: 11px; }
          .print\\:hidden { display: none !important; }
          nav, aside, header { display: none !important; }
        }
      `}</style>
    </div>
  )
}
