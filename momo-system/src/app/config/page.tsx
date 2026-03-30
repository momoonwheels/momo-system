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
  const [config, setConfig]   = useState<any[]>([])
  const [edits, setEdits]     = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  // Ingredient units state
  const [ingredients, setIngredients]   = useState<any[]>([])
  const [ingEdits, setIngEdits]         = useState<Record<string,any>>({})
  const [savingIng, setSavingIng]       = useState(false)
  const [loadingIng, setLoadingIng]     = useState(true)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(data => {
      setConfig(data)
      const e: Record<string,number> = {}
      for (const c of data) e[c.id] = Number(c.value)
      setEdits(e)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    fetch('/api/ingredients').then(r => r.json()).then(data => {
      setIngredients(data || [])
      const edits: Record<string,any> = {}
      for (const ing of data || []) {
        edits[ing.id] = {
          vendor_unit_desc: ing.vendor_unit_desc || '',
          conv_factor:      ing.conv_factor      || 1,
          min_order_qty:    ing.min_order_qty    || 1,
        }
      }
      setIngEdits(edits)
      setLoadingIng(false)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    const body = Object.entries(edits).map(([id,value]) => ({ id, value }))
    const res = await fetch('/api/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    if (res.ok) toast.success('Configuration saved!')
    else toast.error('Failed to save')
    setSaving(false)
  }

  const saveIngredientUnits = async () => {
    setSavingIng(true)
    const { supabase } = await import('@/lib/supabase')
    let failed = false
    for (const [id, vals] of Object.entries(ingEdits)) {
      const { error } = await supabase.from('ingredients').update({
        vendor_unit_desc: vals.vendor_unit_desc,
        conv_factor:      Number(vals.conv_factor),
        min_order_qty:    Number(vals.min_order_qty),
      }).eq('id', id)
      if (error) { console.error(error); failed = true }
    }
    if (failed) toast.error('Some items failed to save')
    else toast.success('Ingredient units saved!')
    setSavingIng(false)
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
        {/* ── Existing config sections ── */}
        {(Object.entries(grouped) as [string, any[]][]).map(([group, items]) => (
          <Card key={group} className="p-0 overflow-hidden">
            <div className="px-6 py-3 bg-brand-900 text-white font-semibold text-sm">
              {GROUP_LABELS[group] || group}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
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
                          value={edits[item.id] ?? item.value}
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
            </div>
          </Card>
        ))}

        {/* ── Ingredient Ordering Units ── */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-3 bg-brand-900 text-white font-semibold text-sm flex items-center justify-between">
            <div>
              Ingredient Ordering Units
              <span className="ml-2 text-brand-300 font-normal text-xs">
                Defines what 1 vendor unit equals in recipe units
              </span>
            </div>
            <button
              onClick={saveIngredientUnits}
              disabled={savingIng}
              className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {savingIng ? 'Saving...' : 'Save Ingredient Units'}
            </button>
          </div>

          {loadingIng ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading ingredients...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Recipe Unit</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                      Vendor Unit Description
                      <div className="text-gray-400 font-normal normal-case text-xs">e.g. Case = 40 lbs</div>
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                      Conv Factor
                      <div className="text-gray-400 font-normal normal-case text-xs">recipe units per vendor unit</div>
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                      Min Order
                      <div className="text-gray-400 font-normal normal-case text-xs">vendor units</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients
                    .filter((ing: any) => !ing.is_overhead)
                    .map((ing: any, i: number) => (
                    <tr key={ing.id} className={i%2===0?'bg-white':'bg-gray-50'}>
                      <td className="px-4 py-2">
                        <div className="text-sm font-medium text-gray-800">{ing.name}</div>
                        <div className="text-xs text-gray-400">{ing.code} · {ing.category}</div>
                      </td>
                      <td className="px-4 py-2 text-center text-xs text-gray-500">{ing.recipe_unit}</td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={ingEdits[ing.id]?.vendor_unit_desc || ''}
                          onChange={e => setIngEdits(prev => ({
                            ...prev,
                            [ing.id]: { ...prev[ing.id], vendor_unit_desc: e.target.value }
                          }))}
                          placeholder="e.g. Case = 40 lbs"
                          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number" min="0" step="any"
                          value={ingEdits[ing.id]?.conv_factor ?? ''}
                          onChange={e => setIngEdits(prev => ({
                            ...prev,
                            [ing.id]: { ...prev[ing.id], conv_factor: e.target.value }
                          }))}
                          className="w-20 text-center text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number" min="1" step="1"
                          value={ingEdits[ing.id]?.min_order_qty ?? ''}
                          onChange={e => setIngEdits(prev => ({
                            ...prev,
                            [ing.id]: { ...prev[ing.id], min_order_qty: e.target.value }
                          }))}
                          className="w-16 text-center text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
