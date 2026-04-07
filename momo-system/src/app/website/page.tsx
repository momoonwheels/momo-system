'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function WebsitePage() {
  const supabase = createClient()

  const [message, setMessage]   = useState('')
  const [isActive, setIsActive] = useState(false)
  const [recordId, setRecordId] = useState<number | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState<{ text: string; ok: boolean } | null>(null)

  /* ── load current announcement ── */
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('site_announcements')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .single()

      if (!error && data) {
        setRecordId(data.id)
        setMessage(data.message ?? '')
        setIsActive(data.is_active ?? false)
      }
      setLoading(false)
    }
    load()
  }, [])

  /* ── save ── */
  async function save() {
    setSaving(true)
    const payload = { message, is_active: isActive, updated_at: new Date().toISOString() }

    let error
    if (recordId) {
      ;({ error } = await supabase
        .from('site_announcements')
        .update(payload)
        .eq('id', recordId))
    } else {
      const res = await supabase
        .from('site_announcements')
        .insert(payload)
        .select()
        .single()
      error = res.error
      if (!error && res.data) setRecordId(res.data.id)
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

  /* ── clear (deactivate + wipe message) ── */
  async function clear() {
    setMessage('')
    setIsActive(false)
    setSaving(true)
    const { error } = await supabase
      .from('site_announcements')
      .update({ message: '', is_active: false, updated_at: new Date().toISOString() })
      .eq('id', recordId!)
    setSaving(false)
    showToast(error ? 'Failed to clear.' : 'Announcement cleared from website.', !error)
  }

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok })
    setTimeout(() => setToast(null), 3500)
  }

  /* ── ui ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Website Announcement</h1>
        <p className="mt-1 text-sm text-gray-400">
          Post a message on <span className="text-gray-300">momoonthewheels.com</span> — shown as a popup to every visitor.
        </p>
      </div>

      {/* Status badge */}
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

      {/* Message textarea */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">
          Announcement Message
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          placeholder={`e.g. "We're opening late today at 2pm — sorry for the inconvenience!"`}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
        />
        <p className="text-xs text-gray-500">{message.length} characters</p>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-4 py-4">
        <div>
          <p className="text-sm font-medium text-white">Show on website</p>
          <p className="text-xs text-gray-500 mt-0.5">Toggle off to hide without deleting the message</p>
        </div>
        <button
          onClick={() => setIsActive(v => !v)}
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

      {/* Actions */}
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

      {/* Preview */}
      {message.trim() && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Preview</p>
          <p className="text-sm text-white leading-relaxed">{message}</p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg text-sm font-medium shadow-lg z-50 transition ${
            toast.ok ? 'bg-green-800 text-green-100' : 'bg-red-900 text-red-100'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
