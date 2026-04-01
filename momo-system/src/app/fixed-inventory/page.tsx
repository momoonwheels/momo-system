'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Location = { id: string; name: string }
type FixedItem = {
  id: string
  item_name: string
  quantity: number
  notes: string | null
  sort_order: number
  active: boolean
}

export default function FixedInventoryPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [items, setItems] = useState<FixedItem[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [newItem, setNewItem] = useState({ item_name: '', quantity: 1, notes: '' })
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    supabase
      .from('locations')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (data) {
          setLocations(data)
          setSelectedLocation(data[0]?.id ?? '')
        }
      })
  }, [])

  useEffect(() => {
    if (!selectedLocation) return
    supabase
      .from('fixed_inventory')
      .select('*')
      .eq('location_id', selectedLocation)
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setItems(data ?? []))
  }, [selectedLocation])

  async function updateItem(id: string, field: string, value: string | number) {
    setSaving(id)
    await supabase
      .from('fixed_inventory')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
    setSaving(null)
  }

  async function deleteItem(id: string) {
    await supabase
      .from('fixed_inventory')
      .update({ active: false })
      .eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function addItem() {
    if (!newItem.item_name.trim()) return
    setAdding(true)
    const { data } = await supabase
      .from('fixed_inventory')
      .insert({
        location_id: selectedLocation,
        item_name: newItem.item_name.trim(),
        quantity: newItem.quantity,
        notes: newItem.notes || null,
        sort_order: items.length + 1
      })
      .select()
      .single()
    if (data) setItems(prev => [...prev, data])
    setNewItem({ item_name: '', quantity: 1, notes: '' })
    setAdding(false)
  }

  const locationName = locations.find(l => l.id === selectedLocation)?.name ?? ''

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Fixed Inventory</h1>
        <p className="text-sm text-muted-foreground">Equipment and fixed assets by location</p>
      </div>

      {/* Location tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {locations.map(loc => (
          <button
            key={loc.id}
            onClick={() => setSelectedLocation(loc.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              selectedLocation === loc.id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {loc.name.replace(' Food Truck', '').replace(' (Production)', '')}
          </button>
        ))}
      </div>

      {/* Items table */}
      <div className="border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Item</th>
              <th className="text-center px-4 py-2 font-medium w-24">Qty</th>
              <th className="text-left px-4 py-2 font-medium">Notes</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                <td className="px-4 py-2">
                  <input
                    className="w-full bg-transparent focus:outline-none focus:bg-muted/30 rounded px-1"
                    defaultValue={item.item_name}
                    onBlur={e => {
                      if (e.target.value !== item.item_name)
                        updateItem(item.id, 'item_name', e.target.value)
                    }}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="number"
                    className="w-16 text-center bg-transparent focus:outline-none focus:bg-muted/30 rounded px-1"
                    defaultValue={item.quantity}
                    onBlur={e => {
                      const val = Number(e.target.value)
                      if (val !== item.quantity)
                        updateItem(item.id, 'quantity', val)
                    }}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className="w-full bg-transparent focus:outline-none focus:bg-muted/30 rounded px-1 text-muted-foreground"
                    defaultValue={item.notes ?? ''}
                    placeholder="—"
                    onBlur={e => {
                      if (e.target.value !== (item.notes ?? ''))
                        updateItem(item.id, 'notes', e.target.value)
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  {saving === item.id ? (
                    <span className="text-xs text-muted-foreground">✓</span>
                  ) : (
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-muted-foreground hover:text-destructive text-xs px-1"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add new item */}
      <div className="flex gap-2 items-center">
        <input
          className="flex-1 border rounded px-3 py-1.5 text-sm"
          placeholder="New item name"
          value={newItem.item_name}
          onChange={e => setNewItem(p => ({ ...p, item_name: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && addItem()}
        />
        <input
          type="number"
          className="w-16 border rounded px-3 py-1.5 text-sm text-center"
          value={newItem.quantity}
          onChange={e => setNewItem(p => ({ ...p, quantity: Number(e.target.value) }))}
        />
        <input
          className="w-40 border rounded px-3 py-1.5 text-sm"
          placeholder="Notes (optional)"
          value={newItem.notes}
          onChange={e => setNewItem(p => ({ ...p, notes: e.target.value }))}
        />
        <button
          onClick={addItem}
          disabled={adding || !newItem.item_name.trim()}
          className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  )
}
