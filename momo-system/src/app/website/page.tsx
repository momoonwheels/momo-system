'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Announcement = {
  id: number
  message: string
  is_active: boolean
}

type LocationHours = {
  id: string
  location_key: string
  location_label: string
  days_open: string[]
  opens_time: string
  closes_time: string
  hours_display: string
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_ABBR: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
}

function formatDayRanges(daysOpen: string[]): string {
  const openSet = new Set(daysOpen)
  const ranges: [string, string][] = []
  let start: string | null = null
  let prev: string | null = null
  for (const day of DAY_ORDER) {
    if (openSet.has(day)) {
      if (start === null) start = day
      prev = day
    } else if (start !== null && prev !== null) {
      ranges.push([start, prev])
      start = null
    }
  }
  if (start !== null && prev !== null) ranges.push([start, prev])
  return ranges
    .map(([s, e]) => (s === e ? DAY_ABBR[s] : `${DAY_ABBR[s]}\u2013${DAY_ABBR[e]}`))
    .join(', ')
}

function formatTime12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return t
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function buildDisplayText(daysOpen: string[], opens: string, closes: string): string {
  if (daysOpen.length === 0) return 'Hours coming soon'
  const timeRange = `${formatTime12h(opens)} \u2013 ${formatTime12h(closes)}`
  if (daysOpen.length === 7) {
    return `Open 7 days a week\n${timeRange}`
  }
  const daysText = formatDayRanges(daysOpen)
  const closedDays = DAY_ORDER.filter((d) => !daysOpen.includes(d))
  let text = `${daysText} \u00b7 ${timeRange}`
  if (closedDays.length) {
    const label = closedDays.length === 1 ? `${closedDays[0]}s` : closedDays.map((d) => `${d}s`).join(' & ')
    text += `\nClosed ${label}`
  }
  return text
}

export default function WebsitePage() {
  const [message, setMessage]   = useState('')
  const [isActive, setIsActive] = useState(false)
  const [record, setRecord]     = useState<Announcement | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  const [hours, setHours]             = useState<LocationHours[]>([])
  const [hoursLoading, setHoursLoading] = useState(true)
  const [savingHours, setSavingHours] = useState<string | null>(null)

  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('site_announcements')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .single()

      if (data) {
        setRecord(data)
        setMessage(data.message ?? '')
        setIsActive(data.is_active ?? false)
      }
      setLoading(false)
    }
    async function loadHours() {
      const { data } = await supabase
        .from('location_hours')
        .select('*')
        .order('location_label', { ascending: true })

      if (data) setHours(data)
      setHoursLoading(false)
    }
    load()
    loadHours()
  }, [])

  async function save() {
    setSaving(true)
    const payload = {
      message,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }

    let error = null

    if (record) {
      const res = await supabase
        .from('site_announcements')
        .update(payload)
        .eq('id', record.id)
      error = res.error
    } else {
      const res = await supabase
        .from('site_announcements')
        .insert(payload)
        .select()
        .single()
      error = res.error
      if (!error && res.data) setRecord(res.data)
    }

    setSaving(false)
    if (error) {
      showToast('Failed to save. Try again.', false)
    } else {
      showToast(
        isActive ? 'Announcement is LIVE on the website.' : 'Saved — announcement is hidden.',
        true
      )
    }
  }

  async function clear() {
    if (!record) return
    setMessage('')
    setIsActive(false)
    setSaving(true)
    const res = await supabase
      .from('site_announcements')
      .update({ message: '', is_active: false, updated_at: new Date().toISOString() })
      .eq('id', record.id)
    setSaving(false)
    showToast(res.error ? 'Failed to clear.' : 'Announcement cleared from website.', !res.error)
  }

  function toggleDay(locationKey: string, day: string) {
    setHours((prev) =>
      prev.map((loc) => {
        if (loc.location_key !== locationKey) return loc
        const has = loc.days_open.includes(day)
        const days_open = has
          ? loc.days_open.filter((d) => d !== day)
          : DAY_ORDER.filter((d) => loc.days_open.includes(d) || d === day)
        return { ...loc, days_open }
      })
    )
  }

  function updateTime(locationKey: string, field: 'opens_time' | 'closes_time', value: string) {
    setHours((prev) =>
      prev.map((loc) => (loc.location_key === locationKey ? { ...loc, [field]: value } : loc))
    )
  }

  async function saveHours(locationKey: string) {
    const loc = hours.find((h) => h.location_key === locationKey)
    if (!loc) return
    setSavingHours(locationKey)
    const hours_display = buildDisplayText(loc.days_open, loc.opens_time, loc.closes_time)
    const res = await supabase
      .from('location_hours')
      .update({
        days_open: loc.days_open,
        opens_time: loc.opens_time,
        closes_time: loc.closes_time,
        hours_display,
        updated_at: new Date().toISOString(),
      })
      .eq('id', loc.id)
    setHours((prev) =>
      prev.map((h) => (h.location_key === locationKey ? { ...h, hours_display } : h))
    )
    setSavingHours(null)
    showToast(res.error ? `Failed to save ${loc.location_label} hours.` : `${loc.location_label} hours updated on the website.`, !res.error)
  }

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok })
    setTimeout(() => setToast(null), 3500)
  }

  if (loading || hoursLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">

      {/* Location Hours */}
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-white">Location Hours</h1>
          <p className="mt-1 text-sm text-gray-400">
            Set the days and hours for each location — updates{' '}
            <span className="text-gray-300">momoonthewheels.com</span> automatically.
          </p>
        </div>

        {hours.map((loc) => (
          <div key={loc.location_key} className="bg-gray-900 border border-gray-700 rounded-lg p-5 space-y-4">
            <p className="text-sm font-semibold text-white">{loc.location_label}</p>

            <div className="flex flex-wrap gap-2">
              {DAY_ORDER.map((day) => {
                const active = loc.days_open.includes(day)
                return (
                  <button
                    key={day}
                    onClick={() => toggleDay(loc.location_key, day)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {DAY_ABBR[day]}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Opens</label>
                <input
                  type="time"
                  value={loc.opens_time}
                  onChange={(e) => updateTime(loc.location_key, 'opens_time', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Closes</label>
                <input
                  type="time"
                  value={loc.closes_time}
                  onChange={(e) => updateTime(loc.location_key, 'closes_time', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
            </div>

            <div className="border border-gray-700 rounded-lg p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">Preview</p>
              <p className="text-sm text-white whitespace-pre-line leading-relaxed">
                {buildDisplayText(loc.days_open, loc.opens_time, loc.closes_time)}
              </p>
            </div>

            <button
              onClick={() => saveHours(loc.location_key)}
              disabled={savingHours === loc.location_key}
              className="w-full bg-white text-black text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingHours === loc.location_key ? 'Saving…' : `Save ${loc.location_label} Hours`}
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-800" />

      {/* Website Announcement */}
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Website Announcement</h1>
          <p className="mt-1 text-sm text-gray-400">
            Post a message on{' '}
            <span className="text-gray-300">momoonthewheels.com</span> — shown as a
            popup to every visitor.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              isActive
                ? 'bg-green-900/40 text-green-400 border border-green-700/50'
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-400' : 'bg-gray-500'}`} />
            {isActive ? 'LIVE on website' : 'Hidden'}
          </span>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Announcement Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder={`e.g. "We're opening late today at 2pm — sorry for the inconvenience!"`}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
          />
          <p className="text-xs text-gray-500">{message.length} characters</p>
        </div>

        <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-4 py-4">
          <div>
            <p className="text-sm font-medium text-white">Show on website</p>
            <p className="text-xs text-gray-500 mt-0.5">Toggle off to hide without deleting the message</p>
          </div>
          <button
            onClick={() => setIsActive((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
              isActive ? 'bg-green-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                isActive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={save}
            disabled={saving || !message.trim()}
            className="flex-1 bg-white text-black text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : isActive ? '🟢 Publish Now' : 'Save (keep hidden)'}
          </button>
          {(message || isActive) && (
            <button
              onClick={clear}
              disabled={saving}
              className="px-5 bg-gray-800 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-700 transition border border-gray-700 disabled:opacity-40"
            >
              Clear
            </button>
          )}
        </div>

        {message.trim() && (
          <div className="border border-gray-700 rounded-lg p-4 space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-widest">Preview</p>
            <p className="text-sm text-white leading-relaxed">{message}</p>
          </div>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg text-sm font-medium shadow-lg z-50 ${
            toast.ok ? 'bg-green-800 text-green-100' : 'bg-red-900 text-red-100'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
