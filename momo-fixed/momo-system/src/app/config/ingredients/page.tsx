'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string,any>>({})

  useEffect(() => {
    fetch('/api/ingredients').then(r=>r.json()).then(data => {
      setIngredients(data)
      setLoading(false)
    })
  }, [])

  const save = async (id: string) => {
    const updates = editing[id]
    if (!updates) return
    const res = await fetch('/api/ingredients', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, ...updates })
    })
    if (res.ok) { toast.success('Updated!'); setEditing(prev => { const n={...prev}; delete n[id]; return n }) }
    else toast.error('Failed')
  }

  const grouped = ingredients.reduce((acc: Record<string,any[]>, ing) => {
    if (!acc[ing.category]) acc[ing.category] = []
    acc[ing.category].push(ing)
    return acc
  }, {})

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-8">
      <PageHeader title="Master Inventory" sub="Manage ingredients, vendor units, and current stock on hand" />
      <div className="space-y-6">
        {(Object.entries(grouped) as [string, any[]][]).map(([cat, ings]) => (
          <Card key={cat} className="p-0 overflow-hidden">
            <div className="px-4 py-3 bg-brand-900 text-white font-semibold text-sm">{cat}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Ingredient</th>
                  <th className="text-left px-4 py-2">Vendor Description</th>
                  <th className="text-center px-4 py-2">Conv Factor</th>
                  <th className="text-center px-4 py-2">Min Order</th>
                  <th className="text-center px-4 py-2">Stock on Hand</th>
                  <th className="text-center px-4 py-2">Unit Cost ($)</th>
                  <th className="text-center px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(ings as any[]).map((ing, i) => {
                  const e = editing[ing.id] || {}
                  const onHand = ing.newport_inventory?.[0]?.quantity_on_hand ?? 0
                  const isEditing = !!editing[ing.id]
                  return (
                    <tr key={ing.id} className={i%2===0?'bg-white':'bg-gray-50'}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-800">{ing.name}</div>
                        <div className="text-xs text-gray-400">{ing.code} · {ing.recipe_unit}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{ing.vendor_unit_desc}</td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" step="any"
                          defaultValue={ing.conv_factor}
                          onChange={e2 => setEditing(prev => ({...prev,[ing.id]:{...prev[ing.id],conv_factor:Number(e2.target.value)}}))}
                          className="w-16 text-center text-xs border border-blue-200 bg-blue-50 rounded px-1 py-1" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" step="any"
                          defaultValue={ing.min_order_qty}
                          onChange={e2 => setEditing(prev => ({...prev,[ing.id]:{...prev[ing.id],min_order_qty:Number(e2.target.value)}}))}
                          className="w-16 text-center text-xs border border-blue-200 bg-blue-50 rounded px-1 py-1" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" step="any"
                          defaultValue={onHand}
                          onChange={e2 => setEditing(prev => ({...prev,[ing.id]:{...prev[ing.id],inventory_qty:Number(e2.target.value)}}))}
                          className="w-20 text-center text-xs border border-green-200 bg-green-50 text-green-800 rounded px-1 py-1" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" step="0.01"
                          defaultValue={ing.current_unit_cost||0}
                          onChange={e2 => setEditing(prev => ({...prev,[ing.id]:{...prev[ing.id],current_unit_cost:Number(e2.target.value)}}))}
                          className="w-20 text-center text-xs border border-yellow-200 bg-yellow-50 rounded px-1 py-1" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        {isEditing && (
                          <button onClick={() => save(ing.id)}
                            className="px-3 py-1 text-xs bg-brand-600 text-white rounded hover:bg-brand-700">
                            Save
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </div>
  )
}