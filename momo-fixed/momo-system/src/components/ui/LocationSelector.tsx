'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MapPin } from 'lucide-react'

export default function LocationSelector({ onChange, filter }: {
  onChange: (id: string) => void
  filter?: 'food_truck'|'newport'
}) {
  const [locations, setLocations] = useState<any[]>([])
  const [selected, setSelected] = useState('')

  useEffect(() => {
    supabase.from('locations').select('*').then(({ data }) => {
      const filtered = filter ? (data||[]).filter(l => l.type === filter) : data||[]
      setLocations(filtered)
      if (filtered[0]) { setSelected(filtered[0].id); onChange(filtered[0].id) }
    })
  }, [filter])

  return (
    <div className="flex items-center gap-2">
      <MapPin className="w-4 h-4 text-gray-400" />
      <select
        value={selected}
        onChange={e => { setSelected(e.target.value); onChange(e.target.value) }}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500">
        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </div>
  )
}