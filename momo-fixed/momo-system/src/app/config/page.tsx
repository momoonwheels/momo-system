'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const GROUP_LABELS: Record<string,string> = {
  batch_sizes:   'Batch Sizes',
  serving_sizes: 'Serving Sizes',
  sauce_buffer:  'Sauce Buffer',
  package_sizes: 'Package & Case Sizes',
}

export default function ConfigPage() {
  const [config, setConfig] = useState<any[]>([])
  const [edits, setEdits] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/config').then(r=>r.json()).then(data => {
      setConfig(data)
      const e: Record<string,number> = {}
      for (const c of data) e[c.id] = Number(c.value)
      setEdits(e)
      setLoading(false)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    const body = Object.entries(edits).map(([id,value]) => ({ id, value }))
    const res = await fetch('/api/config', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    })
    if (res.ok) toast.success('Configuration saved!')
    else toast.error('Failed to save')
    setSaving(false)
  }

  const grouped = config.reduce((acc: Record<string,any[]>, c) => {
    if (!acc[c.group_name]) acc[c.group_name] = []
    acc[c.group_name].push(c)
    return acc
  }, {})

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Configuration"
        sub="All system settings. Changes apply immediately to all calculations."
        action={
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        }
      />
      <div className="space-y-6">
        {(Object.entries(grouped) as [string, any[]][]).map(([group, items]) => (
          <Card key={group} className="p-0 overflow-hidden">
            <div className="px-6 py-3 bg-brand-900 text-white font-semibold text-sm">
              {GROUP_LABELS[group] || group}
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[500px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-2 text-xs font-medium text-gray-500 uppercase">Setting</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(items as any[]).map((item, i) => (
                  <tr key={item.id} className={i%2===0?'bg-white':'bg-gray-50'}>
                    <td className="px-6 py-2.5 text-sm font-medium text-gray-800">{item.label}</td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="number" step="any"
                        value={edits[item.id]??item.value}
                        onChange={e => setEdits(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                        className="w-24 text-center text-sm border border-blue-200 bg-blue-50 text-blue-800 font-semibold rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-400">{item.unit}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </div>
  )
}