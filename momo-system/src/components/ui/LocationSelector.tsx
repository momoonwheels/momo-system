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
    let q = supabase.from('locations').select('*').eq('active', true)
    if (filter) q = q.eq('type', filter)
    q.then(({ data }) => {
      setLocations(data||[])
      if (data?.[0]) { setSelected(data[0].id); onChange(data[0].id) }
    })
  }, [filter])

  return (
    <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <select
        value={selected}
        onChange={e => { setSelected(e.target.value); onChange(e.target.value) }}
        className="text-xs lg:text-sm border-none bg-transparent focus:outline-none text-gray-700 font-medium min-w-0">
        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </div>
  )
}