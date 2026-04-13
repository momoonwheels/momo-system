'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductionLog = {
  id: string
  production_date: string
  batches_made: number
  pieces_produced: number
  notes: string | null
}

type FrozenReserve = {
  id: string
  week_start: string
  opening_balance: number
  produced: number
  distributed: number
  closing_balance: number
  notes: string | null
  updated_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIECES_PER_BATCH  = 440
const CAPACITY_PER_DAY  = 880
const TARGET_DAYS       = 5
const WEEKLY_TARGET     = CAPACITY_PER_DAY * TARGET_DAYS  // 4,400
const PIECES_PER_PACKET = 100                             // FM-1
const SUMMER_START      = '2026-06-15'
const WEEKDAYS          = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getWeekStart(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00')
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function fmt(dateStr: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric' })
}

function weeksUntil(target: string): number {
  const ms = new Date(target).getTime() - Date.now()
  return Math.max(0, Math.round(ms / (7 * 24 * 60 * 60 * 1000)))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  
  const today     = new Date().toISOString().split('T')[0]
  const weekStart = getWeekStart(today)

  const [logs,     setLogs]     = useState<ProductionLog[]>([])
  const [reserves, setReserves] = useState<FrozenReserve[]>([])
  const [loading,  setLoading]  = useState(true)

  const [formDate,    setFormDate]    = useState(today)
  const [formBatches, setFormBatches] = useState(2)
  const [formNotes,   setFormNotes]   = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [formMsg,     setFormMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [editingId,       setEditingId]       = useState<string | null>(null)
  const [editDistributed, setEditDistributed] = useState('')
  const [editNotes,       setEditNotes]       = useState('')
  const [savingReserve,   setSavingReserve]   = useState(false)

  const fetchData = useCallback(async () => {
    const [{ data: logData }, { data: resData }] = await Promise.all([
      supabase.from('production_log').select('*').order('production_date', { ascending: false }).limit(35),
      supabase.from('frozen_reserve').select('*').order('week_start', { ascending: false }).limit(12),
    ])
    setLogs(logData ?? [])
    setReserves(resData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function syncReserve(ws: string) {
    const we = addDays(ws, 6)
    const { data: weekLogs } = await supabase
      .from('production_log').select('pieces_produced')
      .gte('production_date', ws).lte('production_date', we)
    const produced = (weekLogs ?? []).reduce((s, l) => s + l.pieces_produced, 0)
    const { data: existing } = await supabase.from('frozen_reserve').select('*').eq('week_start', ws).maybeSingle()
    if (existing) {
      const closing = existing.opening_balance + produced - existing.distributed
      await supabase.from('frozen_reserve')
        .update({ produced, closing_balance: closing, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      const { data: prev } = await supabase.from('frozen_reserve')
        .select('closing_balance').eq('week_start', addDays(ws, -7)).maybeSingle()
      const opening = prev?.closing_balance ?? 0
      await supabase.from('frozen_reserve').insert({
        week_start: ws, opening_balance: opening, produced,
        distributed: 0, closing_balance: opening + produced,
      })
    }
    await fetchData()
  }

  async function handleLog() {
    setFormMsg(null)
    setSubmitting(true)
    const pieces   = formBatches * PIECES_PER_BATCH
    const existing = logs.find(l => l.production_date === formDate)
    const payload  = { batches_made: formBatches, pieces_produced: pieces, notes: formNotes || null, updated_at: new Date().toISOString() }
    const { error } = existing
      ? await supabase.from('production_log').update(payload).eq('id', existing.id)
      : await supabase.from('production_log').insert({ production_date: formDate, ...payload })
    if (error) {
      setFormMsg({ type: 'err', text: error.message })
    } else {
      setFormMsg({ type: 'ok', text: `${existing ? 'Updated' : 'Logged'}: ${pieces.toLocaleString()} momos on ${fmt(formDate, { weekday: 'short', month: 'short', day: 'numeric' })}` })
      setFormNotes('')
      await syncReserve(getWeekStart(formDate))
    }
    setSubmitting(false)
  }

  async function handleSaveDistributed(r: FrozenReserve) {
    setSavingReserve(true)
    const distributed     = parseInt(editDistributed) || 0
    const closing_balance = r.opening_balance + r.produced - distributed
    const { error } = await supabase.from('frozen_reserve')
      .update({ distributed, closing_balance, notes: editNotes || null, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (!error) { setEditingId(null); await fetchData() }
    setSavingReserve(false)
  }

  const thisWeekLogs     = logs.filter(l => getWeekStart(l.production_date) === weekStart)
  const thisWeekProduced = thisWeekLogs.reduce((s, l) => s + l.pieces_produced, 0)
  const progressPct      = Math.min(100, (thisWeekProduced / WEEKLY_TARGET) * 100)
  const currentBalance   = reserves.find(r => r.week_start < weekStart)?.closing_balance ?? 0
  const recent4          = reserves.filter(r => r.week_start < weekStart).slice(0, 4)
  const avgSurplus       = recent4.length > 0
    ? Math.round(recent4.reduce((s, r) => s + r.produced - r.distributed, 0) / recent4.length)
    : null
  const weeksLeft        = weeksUntil(SUMMER_START)
  const projectedBalance = avgSurplus !== null ? currentBalance + avgSurplus * weeksLeft : null
  const projectedPackets = projectedBalance !== null ? Math.floor(projectedBalance / PIECES_PER_PACKET) : null

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-gray-400 text-sm">Loading…</p></div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Production Planner</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track daily output · build frozen reserve · prepare for summer</p>
      </div>

      {/* ── This week ── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-semibold text-gray-800">This Week</h2>
          <span className="text-xs text-gray-400">{fmt(weekStart)} – {fmt(addDays(weekStart, 4))}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Stat value={`${thisWeekLogs.length}/${TARGET_DAYS}`} label="Days Logged" />
          <Stat value={thisWeekProduced.toLocaleString()} sub={`/ ${WEEKLY_TARGET.toLocaleString()}`} label="Momos Made" />
          <Stat
            value={thisWeekProduced >= WEEKLY_TARGET ? 'Complete ✓' : `${(WEEKLY_TARGET - thisWeekProduced).toLocaleString()} to go`}
            label="Weekly Target"
            accent={thisWeekProduced >= WEEKLY_TARGET ? 'green' : 'orange'}
          />
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-5">
          <div className="h-1.5 rounded-full bg-gray-800 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-5 gap-2">
          {WEEKDAYS.map((day, i) => {
            const dateStr = addDays(weekStart, i)
            const log     = logs.find(l => l.production_date === dateStr)
            const isToday = dateStr === today
            return (
              <button key={day}
                onClick={() => { setFormDate(dateStr); setFormBatches(log?.batches_made ?? 2) }}
                className={`rounded-xl p-3 text-center transition-all cursor-pointer ${
                  log ? 'bg-gray-900 text-white' :
                  isToday ? 'bg-blue-50 border-2 border-blue-300 text-blue-700' :
                  'bg-gray-50 border border-gray-200 text-gray-400'
                }`}>
                <div className="text-xs font-medium">{day}</div>
                {log
                  ? <div className="text-sm font-bold mt-1">{log.pieces_produced.toLocaleString()}</div>
                  : <div className="text-xs mt-1 opacity-60">{isToday ? 'today' : '—'}</div>
                }
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3">Tap a day to pre-fill the log form below.</p>
      </section>

      {/* ── Log production ── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Log Production</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Date</label>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
            {logs.find(l => l.production_date === formDate) && (
              <p className="text-xs text-blue-600 mt-1">Already logged — submitting will update this entry.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Batches Made <span className="text-gray-400 font-normal">({formBatches * PIECES_PER_BATCH} momos)</span>
            </label>
            <div className="flex gap-2">
              {[1, 2].map(n => (
                <button key={n} onClick={() => setFormBatches(n)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    formBatches === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>
                  {n === 1 ? '1 batch — 440' : '2 batches — 880'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
          <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)}
            placeholder="e.g. machine issue, extra batch, short shift…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        </div>
        {formMsg && <p className={`text-sm mb-3 ${formMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{formMsg.text}</p>}
        <button onClick={handleLog} disabled={submitting}
          className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving…' : logs.find(l => l.production_date === formDate) ? 'Update Entry' : 'Log Production'}
        </button>
      </section>

      {/* ── Frozen reserve ledger ── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="font-semibold text-gray-800">Frozen Reserve Ledger</h2>
          <div className="text-sm">
            <span className="text-gray-500">Current balance: </span>
            <span className="font-bold text-gray-900">{currentBalance.toLocaleString()} momos</span>
            <span className="text-gray-400 ml-1">({Math.floor(currentBalance / PIECES_PER_PACKET)} pkts)</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-400 font-medium">
                <th className="text-left pb-2 pr-4">Week</th>
                <th className="text-right pb-2 px-3">Opening</th>
                <th className="text-right pb-2 px-3">Produced</th>
                <th className="text-right pb-2 px-3">Distributed</th>
                <th className="text-right pb-2 px-3">Balance</th>
                <th className="pb-2 pl-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {reserves.map(r => {
                const isEditing = editingId === r.id
                const surplus   = r.produced - r.distributed
                return (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{fmt(r.week_start)} – {fmt(addDays(r.week_start, 4))}</td>
                    <td className="py-3 px-3 text-right text-gray-500">{r.opening_balance.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-emerald-600 font-medium">+{r.produced.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right">
                      {isEditing
                        ? <input type="number" value={editDistributed} onChange={e => setEditDistributed(e.target.value)}
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm" autoFocus />
                        : <span className="text-orange-500">−{r.distributed.toLocaleString()}</span>
                      }
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-bold text-gray-900">{r.closing_balance.toLocaleString()}</span>
                      <span className="text-gray-400 text-xs ml-1">({Math.floor(r.closing_balance / PIECES_PER_PACKET)} pkts)</span>
                      {surplus > 0 && <div className="text-xs text-emerald-500 font-medium">+{surplus.toLocaleString()} saved</div>}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {isEditing ? (
                        <div className="flex flex-col gap-1 items-end">
                          <button onClick={() => handleSaveDistributed(r)} disabled={savingReserve}
                            className="text-xs text-emerald-600 font-semibold hover:text-emerald-800 disabled:opacity-50">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingId(r.id); setEditDistributed(String(r.distributed)); setEditNotes(r.notes ?? '') }}
                          className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {reserves.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">No reserve records yet. Log your first production day above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
          <strong>Distributed</strong> = momos sent to trucks that week (LC + Salem combined). Enter after Monday delivery. Each FM-1 packet = 100 pieces.
        </p>
      </section>

      {/* ── Summer readiness ── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">
          Summer Readiness
          <span className="ml-2 text-xs font-normal text-gray-400">Target: Jun 15, 2026</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummerCard value={String(weeksLeft)}                sub="weeks"     label="Until Jun 15"       color="blue"   />
          <SummerCard value={currentBalance.toLocaleString()}  sub="momos"     label="Reserve Now"        color="gray"   />
          <SummerCard
            value={avgSurplus !== null ? `+${avgSurplus.toLocaleString()}` : '—'}
            sub={avgSurplus !== null ? 'momos/wk' : 'need more data'}
            label="Avg Weekly Surplus" color="green"
          />
          <SummerCard
            value={projectedPackets !== null ? `${projectedPackets}` : '—'}
            sub={projectedPackets !== null ? `pkts (${projectedBalance!.toLocaleString()} momos)` : 'need more data'}
            label="Projected by Jun 15"
            color={projectedPackets !== null && projectedPackets >= 50 ? 'green' : 'yellow'}
          />
        </div>
        {avgSurplus === null && (
          <p className="text-xs text-gray-400 mt-4">Projection appears after 1+ completed weeks with distributed data entered.</p>
        )}
        {avgSurplus !== null && projectedPackets !== null && (
          <div className="mt-4 p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
            At your current pace you&apos;ll have approx{' '}
            <strong className="text-gray-900">{projectedPackets} packets ({projectedBalance!.toLocaleString()} momos)</strong>{' '}
            in reserve when summer starts.{' '}
            {projectedPackets < 50
              ? 'Consider maximising 5-day weeks now — every surplus day adds 2 packets.'
              : 'Looking solid. If summer demand surges you have runway to expand to 7 days.'}
          </div>
        )}
      </section>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ value, sub, label, accent }: { value: string; sub?: string; label: string; accent?: 'green' | 'orange' }) {
  const color = accent === 'green' ? 'text-emerald-600' : accent === 'orange' ? 'text-orange-500' : 'text-gray-900'
  return (
    <div className="text-center">
      <div className={`text-xl font-bold leading-none ${color}`}>
        {value}{sub && <span className="text-sm font-normal text-gray-400 ml-0.5">{sub}</span>}
      </div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}

const SUMMER_COLORS = {
  blue:   'bg-blue-50 text-blue-700',
  gray:   'bg-gray-50 text-gray-700',
  green:  'bg-emerald-50 text-emerald-700',
  yellow: 'bg-yellow-50 text-yellow-700',
}

function SummerCard({ value, sub, label, color = 'gray' }: { value: string; sub?: string; label: string; color?: keyof typeof SUMMER_COLORS }) {
  return (
    <div className={`rounded-xl p-4 ${SUMMER_COLORS[color]}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      {sub && <div className="text-xs mt-0.5 opacity-75">{sub}</div>}
      <div className="text-xs mt-2 opacity-60 leading-snug">{label}</div>
    </div>
  )
}
