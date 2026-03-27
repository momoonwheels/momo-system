'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const CONTEXTS = [
  {key:'REG',label:'Regular Mo:Mo /order'},{key:'FRI',label:'Fried Mo:Mo /order'},
  {key:'CHI',label:'Chilli Mo:Mo /order'},{key:'JHO',label:'Jhol Mo:Mo /order'},
  {key:'CW',label:'Chowmein /order'},
  {key:'BATCH_FM',label:'Frozen Momo /batch'},{key:'BATCH_RA',label:'Reg Achar /batch'},
  {key:'BATCH_SA',label:'Spicy Achar /batch'},{key:'BATCH_JH',label:'Jhol Soup /10 orders'},
  {key:'BATCH_CW',label:'CW Marinade /10 orders'},
]

export default function RecipeMatrixPage() {
  const [items, setItems] = useState<any[]>([])
  const [edits, setEdits] = useState<Record<string,Record<string,number>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/recipe-matrix').then(r=>r.json()).then(data => {
      setItems(data)
      const e: Record<string,Record<string,number>> = {}
      for (const row of data) {
        const code = row.ingredients?.code
        if (!code) continue
        if (!e[code]) e[code] = {}
        e[code][row.context] = Number(row.qty)||0
      }
      setEdits(e)
      setLoading(false)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    const ingIds: Record<string,string> = {}
    for (const row of items) {
      const code = row.ingredients?.code
      if (code) ingIds[code] = row.ingredient_id
    }
    const body: any[] = []
    for (const [code, ctxs] of Object.entries(edits)) {
      for (const [ctx, qty] of Object.entries(ctxs)) {
        if (qty > 0 && ingIds[code]) {
          body.push({ ingredient_id: ingIds[code], context: ctx, qty })
        }
      }
    }
    const res = await fetch('/api/recipe-matrix', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    })
    if (res.ok) toast.success('Recipe matrix saved!')
    else toast.error('Failed to save')
    setSaving(false)
  }

  // Get unique ingredients
  const ingMap: Record<string,any> = {}
  for (const row of items) {
    const code = row.ingredients?.code
    if (code && !ingMap[code]) ingMap[code] = row.ingredients
  }

  // Group by category
  const catMap: Record<string,string[]> = {}
  for (const [code, ing] of Object.entries(ingMap)) {
    const cat = ing.category||'Other'
    if (!catMap[cat]) catMap[cat] = []
    catMap[cat].push(code)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-8">
      <PageHeader
        title="Recipe Matrix"
        sub="Edit ingredient quantities per order or per batch. All changes flow to Order List automatically."
        action={
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Recipe Matrix'}
          </button>
        }
      />
      <Card className="p-0 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-brand-900 text-white">
              <th className="sticky left-0 bg-brand-900 text-left px-4 py-3 font-medium min-w-48">Ingredient</th>
              <th className="text-center px-2 py-3 font-medium min-w-16">Unit</th>
              {CONTEXTS.map(c => (
                <th key={c.key} className="text-center px-2 py-3 font-medium min-w-20 text-brand-300">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.entries(catMap) as [string, string[]][]).map(([cat, codes]) => (
              <>
                <tr key={cat} className="bg-brand-800">
                  <td colSpan={2+CONTEXTS.length} className="px-4 py-2 text-white font-semibold text-xs uppercase tracking-wider">{cat}</td>
                </tr>
                {codes.map((code, i) => {
                  const ing = ingMap[code]
                  return (
                    <tr key={code} className={i%2===0?'bg-white':'bg-gray-50'}>
                      <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-gray-800">{ing.name}</td>
                      <td className="px-2 py-2 text-center text-gray-400">{ing.recipe_unit}</td>
                      {CONTEXTS.map(ctx => {
                        const val = edits[code]?.[ctx.key] || 0
                        return (
                          <td key={ctx.key} className="px-1 py-1.5 text-center">
                            <input
                              type="number" min="0" step="any"
                              value={val || ''}
                              placeholder="—"
                              onChange={e => setEdits(prev => ({
                                ...prev,
                                [code]: { ...prev[code], [ctx.key]: Number(e.target.value)||0 }
                              }))}
                              className={`w-16 text-center rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400 ${
                                val > 0
                                  ? 'border border-blue-200 bg-blue-50 text-blue-800 font-semibold'
                                  : 'border border-transparent bg-transparent text-gray-300'
                              }`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}